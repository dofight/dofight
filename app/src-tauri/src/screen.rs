//! Reads the reference Dofus window like a player looks at it: its own content is captured (Dofight's windows
//! never hide it), light text is kept, and the platform's OCR reads it (platform/: Windows OCR, Vision on macOS). Nothing is ever sent to the game.

use crate::diag;
use crate::iconbar::{Bar, read_bar, scores};
use crate::ocr::OcrLine;
use crate::platform::{self, CaptureError, DofusWindow, Frame, OcrEngine, WindowId};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Every TICK the window is captured and its map header compared with the last reading (about a millisecond). The
/// text is read (about 120 ms) only when that header changed (another map: read twice, as a new room needs two same
/// readings in a row), when Dofus comes back in front, or every CALM_READ_EVERY / FIGHT_READ_EVERY to notice a fight
/// starting or ending.
const TICK: Duration = Duration::from_millis(300);
const CALM_READ_EVERY: Duration = Duration::from_millis(2000);
const FIGHT_READ_EVERY: Duration = Duration::from_millis(1500);
/// When the icon bar tells fights from calm (iconbar.rs), a fight starting or ending is seen without reading text:
/// the text is then read again only as a safety, this often.
const SAFETY_READ_EVERY: Duration = Duration::from_secs(10);
/// The map header corner (top left, frame pixels; header.ts reads the same corner) and how many of its light pixels
/// must change to count as another map.
const CORNER_W: u32 = 600;
const CORNER_H: u32 = 160;
const CORNER_CHANGE: usize = 40;
/// The header text: white (above TEXT_WHITE) with a dark outline (under TEXT_OUTLINE, two pixels away).
const TEXT_WHITE: u32 = 225;
const TEXT_OUTLINE: u32 = 90;
/// A header change is read at most this often (an animated corner could otherwise ask for a reading every tick).
const CHANGE_READ_EVERY: Duration = Duration::from_millis(1000);
/// « Songe » mode, out of a fight: the mouse is checked this often. Once it rests, the area around it is read after
/// these delays (the tooltip may take a moment to show) until a group tooltip is found; nothing while it moves.
const HOVER_TICK: Duration = Duration::from_millis(50);
const HOVER_TRIES: [Duration; 3] = [
    Duration::from_millis(80),
    Duration::from_millis(350),
    Duration::from_millis(800),
];
/// The area read around the resting mouse: a group tooltip shows above the hovered group, up to 8 monster lines.
const HOVER_HALF_WIDTH: i32 = 400;
const HOVER_ABOVE: i32 = 450;
const HOVER_BELOW: i32 = 250;
/// Grey level above which a pixel counts as light text (the header, the fight button, « Combat terminé »).
pub const LIGHT: u8 = 200;
pub const SCALE: u32 = 2;
/// Grey level of the monster lines in a group tooltip: light grey (about 170) on a very dark box (under 60).
pub const TOOLTIP_TEXT: u8 = 100;
/// Area read under a group tooltip's « Niveau N » header: up to 8 monster lines and the XP line.
const TOOLTIP_HALF_WIDTH: i32 = 180;
const TOOLTIP_HEIGHT: i32 = 200;

#[derive(Debug, Clone, Serialize)]
pub struct Tick {
    pub front: bool,
    pub lines: Vec<OcrLine>,
    pub error: Option<String>,
    /// The top-left icon bar as last seen (a covered bar keeps the last state); unknown only while the icons were
    /// never recognised (another window size, a folded bar): the texts decide then.
    pub bar: Option<Bar>,
}

/// The title prefix of the reference window (the character name), set from the settings; empty = first found.
#[derive(Default, Clone)]
pub struct Reference(pub Arc<Mutex<String>>);

/// « Songe » mode: read the group tooltips the player hovers (out of a fight only). The second flag asks for one
/// reading of the screen right away (Songe turned off: the zone is read again, even in a fight).
#[derive(Default, Clone)]
pub struct Songe(pub Arc<AtomicBool>, pub Arc<AtomicBool>);

/// The overlay's own view of the fight (set from the page): in a fight the screen is read less and Songe sleeps.
#[derive(Default, Clone)]
pub struct InFight(pub Arc<AtomicBool>);

/// « Lecture de l'écran » (set from the page): off, the Dofus window is never captured, nor is it checked whether it
/// is in front (« Masquer hors du jeu » rests meanwhile). Off until the page has read the player's settings, so a
/// player who turned it off is never captured, not even at launch. The second field is « Scanner ma sous-zone »,
/// clicked while the zone is not followed (the reading or its zone option off): SCAN_READS readings of the corner (sent as `screen:scan`), only while Dofus is
/// in front and within SCAN_VALID of the click; then nothing again.
#[derive(Default, Clone)]
pub struct Reading(pub Arc<AtomicBool>, pub Arc<Mutex<Option<(Instant, u8)>>>);

/// « Scanner ma sous-zone »: two readings one TICK apart (the page keeps the zone only when both agree: a fight's
/// effects may garble the corner), asked within this long of the click (Dofus is brought in front first).
pub const SCAN_READS: u8 = 2;
const SCAN_VALID: Duration = Duration::from_secs(3);

/// One reading asked by « Scanner ma sous-zone »: the corner's lines and the icon bar seen; `error` when Dofus could
/// not be read (« no-dofus », « no-ocr », « no-capture »).
#[derive(Debug, Clone, Serialize)]
pub struct Scan {
    pub lines: Vec<OcrLine>,
    pub bar: Option<Bar>,
    pub error: Option<String>,
    /// Readings still to come for this click.
    pub left: u8,
}

/// Gives the focus back to the reference Dofus window (the player just clicked « Songe » in Dofight: the game only shows
/// a group's tooltip on hover when it is in front). A window activation only: nothing is sent to the game.
pub fn focus_reference(prefix: &str) -> bool {
    let Some(target) = pick(&platform::dofus_windows(), prefix) else { return false };
    platform::focus(target.id)
}

/// The visible Dofus windows (see platform).
pub fn dofus_windows() -> Vec<DofusWindow> {
    platform::dofus_windows()
}

fn pick(windows: &[DofusWindow], prefix: &str) -> Option<DofusWindow> {
    windows
        .iter()
        .find(|w| !prefix.is_empty() && w.title.starts_with(prefix))
        .or_else(|| windows.first())
        .cloned()
}

/// True when a capture came back black (some games refuse PrintWindow): fewer than 0.5 % of sampled pixels lit.
pub fn is_blank(bgra: &[u8]) -> bool {
    let pixels = bgra.len() / 4;
    if pixels == 0 {
        return true;
    }
    let step = 97;
    let (mut seen, mut lit) = (0usize, 0usize);
    let mut i = 0;
    while i < pixels {
        seen += 1;
        let p = &bgra[i * 4..i * 4 + 3];
        if p.iter().any(|&c| c > 24) {
            lit += 1;
        }
        i += step;
    }
    lit * 200 < seen
}

/// Light text becomes black on white, scaled `SCALE` times: what the Windows OCR reads best on game frames.
pub fn light_text(bgra: &[u8], width: u32, height: u32) -> (Vec<u8>, u32, u32) {
    binarize(bgra, width, height, LIGHT)
}

fn grey(bgr: &[u8]) -> u32 {
    (bgr[0] as u32 * 114 + bgr[1] as u32 * 587 + bgr[2] as u32 * 299) / 1000
}

/// The text pixels of the map header corner, one flag per pixel: another map (or other coordinates) changes them.
/// Only white pixels with the game's dark outline around them count (the header text is drawn that way), so a bright,
/// animated map behind the header (a town, lava) does not look like a change: on a bright map, about 1 100 text
/// pixels against 24 000 light ones.
pub fn corner_mask(bgra: &[u8], width: u32, height: u32) -> Vec<bool> {
    let (w, h) = (CORNER_W.min(width), CORNER_H.min(height));
    let at = |x: u32, y: u32| grey(&bgra[((y * width + x) * 4) as usize..][..3]);
    let mut mask = Vec::with_capacity((w * h) as usize);
    for y in 0..h {
        for x in 0..w {
            let text = at(x, y) > TEXT_WHITE
                && x >= 2
                && y >= 2
                && x + 2 < width
                && y + 2 < height
                && [at(x - 2, y), at(x + 2, y), at(x, y - 2), at(x, y + 2)].into_iter().any(|g| g < TEXT_OUTLINE);
            mask.push(text);
        }
    }
    mask
}

/// True when the header corner shows something else (a few pixels may flicker on an animated map).
pub fn corner_changed(before: &[bool], now: &[bool]) -> bool {
    before.len() != now.len() || before.iter().zip(now).filter(|(a, b)| a != b).count() > CORNER_CHANGE
}

/// Pixels brighter than `threshold` become black on white, scaled `SCALE` times.
fn binarize(bgra: &[u8], width: u32, height: u32, threshold: u8) -> (Vec<u8>, u32, u32) {
    let (ow, oh) = (width * SCALE, height * SCALE);
    let mut out = vec![255u8; (ow * oh * 4) as usize];
    for y in 0..oh {
        for x in 0..ow {
            let i = (((y / SCALE) * width + (x / SCALE)) * 4) as usize;
            if grey(&bgra[i..i + 3]) > threshold as u32 {
                let o = ((y * ow + x) * 4) as usize;
                out[o..o + 3].copy_from_slice(&[0, 0, 0]);
            }
        }
    }
    (out, ow, oh)
}

/// The top-left corner the zone reading needs: the zone name, the map coordinates, a Songe's « Palier / Profondeur »
/// lines (header.ts and dream.ts look there). The rest of the screen is never read for the zone or the fight (the fight
/// comes from the icon bar), which keeps each reading small. Sized for a 1009-pixel-high game, scaled with it.
pub fn corner_size(width: u32, height: u32) -> (u32, u32) {
    let f = (height as f32 / 1009.0).max(1.0);
    (width.min((720.0 * f) as u32), height.min((300.0 * f) as u32))
}

/// OCR lines of the frame's top-left corner (see corner_size), in the frame's pixels.
pub fn read_corner(
    engine: &OcrEngine,
    bgra: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<OcrLine>, String> {
    let (cw, ch) = corner_size(width, height);
    let mut corner = Vec::with_capacity((cw * ch * 4) as usize);
    for y in 0..ch {
        let start = (y * width * 4) as usize;
        corner.extend_from_slice(&bgra[start..start + (cw * 4) as usize]);
    }
    // the header text is white with a dark outline: read only that (a bright, busy map behind it, the world map open,
    // added stray letters); when that finds no coordinates (a Songe's header, a menu), read the light pixels as before
    let (img, w, h) = outlined_text(&corner, cw, ch);
    let lines = scaled_down(platform::recognize(engine, &img, w, h)?);
    let readable = |lines: &[OcrLine]| lines.iter().any(|l| has_coordinates(&l.text) || has_whole_title(&l.text));
    if readable(&lines) {
        return Ok(lines);
    }
    // on snow the outline blends into the white behind it (owner's capture, 2026-11-20): the letters' cores are pure
    // white, which the snow never is
    let (img, w, h) = pure_white_text(&corner, cw, ch);
    // the OCR reads that thin « ( » as « { » now and then; a zone name never holds braces
    let white: Vec<OcrLine> = scaled_down(platform::recognize(engine, &img, w, h)?)
        .into_iter()
        .map(|l| OcrLine { text: l.text.replace('{', "(").replace('}', ")"), ..l })
        .collect();
    if readable(&white) {
        return Ok(white);
    }
    read_frame(engine, &corner, cw, ch)
}

/// The header's pure white pixels (every channel at PURE_WHITE or more), specks dropped, black on white, scaled `SCALE`
/// times: the letters when the background is white too (snow).
fn pure_white_text(bgra: &[u8], width: u32, height: u32) -> (Vec<u8>, u32, u32) {
    let mut keep: Vec<bool> = bgra.chunks_exact(4).map(|p| p[..3].iter().all(|&c| c >= PURE_WHITE)).collect();
    // the background is almost never pure white: only lone pixels to drop, the minus signs and commas stay
    drop_specks(&mut keep, width, height, PURE_SPECK_MAX);
    let (ow, oh) = (width * SCALE, height * SCALE);
    let mut out = vec![255u8; (ow * oh * 4) as usize];
    for y in 0..height {
        for x in 0..width {
            if keep[(y * width + x) as usize] {
                for dy in 0..SCALE {
                    for dx in 0..SCALE {
                        let o = (((y * SCALE + dy) * ow + x * SCALE + dx) * 4) as usize;
                        out[o..o + 3].copy_from_slice(&[0, 0, 0]);
                    }
                }
            }
        }
    }
    (out, ow, oh)
}

const PURE_SPECK_MAX: usize = 3;

/// The header letters' cores (measured on snow and bright grass captures: letters 255, the background at most 254).
const PURE_WHITE: u8 = 254;

/// « 3,26 • Niveau 30 », « -16, 19 »: a line that starts like map coordinates.
fn has_coordinates(text: &str) -> bool {
    let t: Vec<char> = text.trim_start_matches(|c: char| c == '-' || c == '–' || c == '—' || c.is_whitespace()).chars().collect();
    let digits = t.iter().take_while(|c| c.is_ascii_digit()).count();
    (1..=3).contains(&digits) && matches!(t.get(digits), Some(',') | Some('.'))
}

/// Black on white, scaled `SCALE` times: only the light pixels that have a dark pixel near them (the outline the game
/// draws around its header text), so the scenery behind the text is left out.
fn outlined_text(bgra: &[u8], width: u32, height: u32) -> (Vec<u8>, u32, u32) {
    let at = |x: u32, y: u32| grey(&bgra[((y * width + x) * 4) as usize..][..3]);
    let near_dark = |x: u32, y: u32| {
        let (x0, y0, x1, y1) = (x.saturating_sub(3), y.saturating_sub(3), (x + 3).min(width - 1), (y + 3).min(height - 1));
        (y0..=y1).any(|yy| (x0..=x1).any(|xx| at(xx, yy) < TEXT_OUTLINE))
    };
    let mut keep: Vec<bool> = (0..width * height).map(|i| at(i % width, i / width) > LIGHT as u32 && near_dark(i % width, i / width)).collect();
    drop_specks(&mut keep, width, height, SPECK_MAX);
    let (ow, oh) = (width * SCALE, height * SCALE);
    let mut out = vec![255u8; (ow * oh * 4) as usize];
    for y in 0..height {
        for x in 0..width {
            if keep[(y * width + x) as usize] {
                for dy in 0..SCALE {
                    for dx in 0..SCALE {
                        let o = (((y * SCALE + dy) * ow + x * SCALE + dx) * 4) as usize;
                        out[o..o + 3].copy_from_slice(&[0, 0, 0]);
                    }
                }
            }
        }
    }
    (out, ow, oh)
}

/// Specks: kept pixels in blobs smaller than this (a bright map's light pixels next to its dark ones, owner's full
/// screen capture of 2026-11-20); the header's letters are much bigger. They cut the OCR's line (« (Champ•des »).
const SPECK_MAX: usize = 16;

/// Clears the blobs of `keep` (pixels touching up, down or sideways) smaller than `min` pixels.
fn drop_specks(keep: &mut [bool], width: u32, height: u32, min: usize) {
    let (w, h) = (width as usize, height as usize);
    let mut seen = vec![false; w * h];
    let mut blob = Vec::new();
    for start in 0..w * h {
        if seen[start] || !keep[start] {
            continue;
        }
        blob.clear();
        blob.push(start);
        seen[start] = true;
        let mut k = 0;
        while k < blob.len() {
            let i = blob[k];
            k += 1;
            let (x, y) = (i % w, i / w);
            let mut visit = |j: usize| {
                if !seen[j] && keep[j] {
                    seen[j] = true;
                    blob.push(j);
                }
            };
            if x > 0 { visit(i - 1); }
            if x + 1 < w { visit(i + 1); }
            if y > 0 { visit(i - w); }
            if y + 1 < h { visit(i + w); }
        }
        if blob.len() < min {
            for &i in &blob {
                keep[i] = false;
            }
        }
    }
}

/// « Amakna (Champ des Ingalsse) »: a whole « Zone (Sous-zone) » title, enough to find the zone without coordinates.
fn has_whole_title(text: &str) -> bool {
    let (Some(open), Some(close)) = (text.find('('), text.rfind(')')) else { return false };
    open > 0 && close > open + 3
}

fn scaled_down(lines: Vec<OcrLine>) -> Vec<OcrLine> {
    let s = SCALE as i32;
    lines.into_iter().map(|l| OcrLine { x: l.x / s, y: l.y / s, w: l.w / s, h: l.h / s, ..l }).collect()
}

/// OCR lines of one frame, in the frame's pixels.
pub fn read_frame(
    engine: &OcrEngine,
    bgra: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<OcrLine>, String> {
    let (img, w, h) = light_text(bgra, width, height);
    let lines = platform::recognize(engine, &img, w, h)?;
    let s = SCALE as i32;
    Ok(lines
        .into_iter()
        .map(|l| OcrLine {
            x: l.x / s,
            y: l.y / s,
            w: l.w / s,
            h: l.h / s,
            ..l
        })
        .collect())
}

/// The monster lines of the group tooltips on the frame, read under each « Niveau N » / « Level N » header found
/// in `lines` (the first reading keeps only white text; these lines are light grey). Frame pixels.
pub fn read_tooltips(
    engine: &OcrEngine,
    bgra: &[u8],
    width: u32,
    height: u32,
    lines: &[OcrLine],
) -> Result<Vec<OcrLine>, String> {
    let mut out = Vec::new();
    for header in lines.iter().filter(|l| is_group_header(&l.text)) {
        let cx = header.x + header.w / 2;
        let y0 = header.y + header.h + 2;
        let area = (cx - TOOLTIP_HALF_WIDTH, y0, cx + TOOLTIP_HALF_WIDTH, y0 + TOOLTIP_HEIGHT);
        out.extend(read_area(engine, bgra, width, height, area, TOOLTIP_TEXT)?);
    }
    Ok(out)
}

/// The group tooltips around the resting mouse (`cx`, `cy` in frame pixels): their headers, then their monster
/// lines. Empty when no group tooltip is there.
pub fn read_hovered(
    engine: &OcrEngine,
    bgra: &[u8],
    width: u32,
    height: u32,
    cx: i32,
    cy: i32,
) -> Result<Vec<OcrLine>, String> {
    let area = (cx - HOVER_HALF_WIDTH, cy - HOVER_ABOVE, cx + HOVER_HALF_WIDTH, cy + HOVER_BELOW);
    let mut lines = read_area(engine, bgra, width, height, area, LIGHT)?;
    if !lines.iter().any(|l| is_group_header(&l.text)) {
        return Ok(vec![]);
    }
    let more = read_tooltips(engine, bgra, width, height, &lines)?;
    lines.extend(more);
    Ok(lines)
}

/// The text in one area of the frame (x0, y0, x1, y1, clipped to it): pixels brighter than `threshold`. Frame pixels.
fn read_area(
    engine: &OcrEngine,
    bgra: &[u8],
    width: u32,
    height: u32,
    (x0, y0, x1, y1): (i32, i32, i32, i32),
    threshold: u8,
) -> Result<Vec<OcrLine>, String> {
    let (x0, y0) = (x0.max(0), y0.max(0));
    let (x1, y1) = (x1.min(width as i32), y1.min(height as i32));
    if x1 - x0 < 20 || y1 - y0 < 10 {
        return Ok(vec![]);
    }
    let (cw, ch) = ((x1 - x0) as u32, (y1 - y0) as u32);
    let mut crop = Vec::with_capacity((cw * ch * 4) as usize);
    for y in y0..y1 {
        let start = ((y as u32 * width + x0 as u32) * 4) as usize;
        crop.extend_from_slice(&bgra[start..start + (cw * 4) as usize]);
    }
    let (img, w, h) = binarize(&crop, cw, ch, threshold);
    let s = SCALE as i32;
    Ok(platform::recognize(engine, &img, w, h)?
        .into_iter()
        .map(|l| OcrLine {
            x: x0 + l.x / s,
            y: y0 + l.y / s,
            w: l.w / s,
            h: l.h / s,
            ..l
        })
        .collect())
}

/// « Niveau 132 » (French client) or « Level 132 » (English client): the first line of a group tooltip. The OCR
/// misreads it now and then (« Niueau 468 », « Nive?u 132 »): a word close to Niveau/Level, then a number.
pub fn is_group_header(text: &str) -> bool {
    let mut words = text.split_whitespace();
    let (Some(word), Some(number), None) = (words.next(), words.next(), words.next()) else {
        return false;
    };
    let word = word.to_lowercase();
    let digits = number.chars().filter(|c| c.is_ascii_digit()).count();
    let close = |target: &str| edit_distance(&word, target) <= 2;
    (close("niveau") || close("level")) && digits >= 1 && digits + 1 >= number.chars().count()
}

fn edit_distance(a: &str, b: &str) -> usize {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let mut row: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut prev = row[0];
        row[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cur = row[j + 1];
            row[j + 1] = (prev + usize::from(ca != cb)).min(row[j] + 1).min(cur + 1);
            prev = cur;
        }
    }
    row[b.len()]
}

/// What the reading loop remembers between ticks.
struct Reader {
    loop_start: Instant,
    last_slow: Option<Instant>,
    /// When the text was last read, and the header corner it showed.
    last_read: Option<Instant>,
    read_mask: Option<Vec<bool>>,
    /// The header changed at the last reading: read once more to confirm the new room.
    confirm: bool,
    was_front: bool,
    /// Where the mouse was last seen (None until it was over the window once).
    cursor: Option<(i32, i32)>,
    still_since: Instant,
    hover_tries: usize,
    /// The last known icon bar (never Unknown): None until the bar was recognised once.
    bar: Option<Bar>,
    /// What was last written to the diagnostic log about the window (errors, size), to log changes only.
    logged_state: String,
    stats: Stats,
}

/// Dev builds print what the reading costs every 30 s (in the `pnpm tauri dev` output).
#[derive(Default)]
struct Stats {
    since: Option<Instant>,
    captures: u32,
    capture_ms: u128,
    reads: u32,
    read_ms: u128,
    hovers: u32,
    hover_ms: u128,
}

impl Stats {
    fn report(&mut self) {
        let since = *self.since.get_or_insert_with(Instant::now);
        if since.elapsed() < Duration::from_secs(30) {
            return;
        }
        let avg = |ms: u128, n: u32| if n == 0 { 0 } else { ms / n as u128 };
        let line = format!(
            "30 s: {} captures ({} ms avg), {} readings ({} ms avg), {} Songe readings ({} ms avg)",
            self.captures,
            avg(self.capture_ms, self.captures),
            self.reads,
            avg(self.read_ms, self.reads),
            self.hovers,
            avg(self.hover_ms, self.hovers)
        );
        if self.captures > 0 {
            diag::log("cost", &line); // only while Dofus is read: an idle Dofight writes nothing
        }
        if cfg!(debug_assertions) {
            eprintln!("[screen] {line}");
        }
        *self = Stats {
            since: Some(Instant::now()),
            ..Stats::default()
        };
    }
}

/// « Scanner ma sous-zone »: whether a reading is asked now, and how many will follow it (the request is updated).
/// A request older than SCAN_VALID is given up (Dofus never came in front): the page is told.
fn scan_due(app: &AppHandle, asked: &Mutex<Option<(Instant, u8)>>) -> Option<u8> {
    let mut asked = asked.lock().ok()?;
    let (at, left) = (*asked)?;
    if at.elapsed() > SCAN_VALID {
        *asked = None;
        diag::log("screen", "scan asked but Dofus was not in front: given up");
        let _ = app.emit("screen:scan", Scan { lines: vec![], bar: None, error: Some("not-front".into()), left: 0 });
        return None;
    }
    let left = left.saturating_sub(1);
    *asked = if left > 0 { Some((at, left)) } else { None };
    Some(left)
}

/// One reading for « Scanner ma sous-zone »: the corner of `frame`, sent as `screen:scan`.
fn emit_scan(app: &AppHandle, engine: Option<&OcrEngine>, frame: Option<&Frame>, left: u8) {
    let scan = match (engine, frame) {
        (None, _) => Scan { lines: vec![], bar: None, error: Some("no-ocr".into()), left },
        (_, None) => Scan { lines: vec![], bar: None, error: Some("no-capture".into()), left },
        (Some(engine), Some((px, w, h))) => match read_corner(engine, px, *w, *h) {
            Ok(lines) => Scan { lines, bar: Some(read_bar(px, *w, *h)), error: None, left },
            Err(e) => Scan { lines: vec![], bar: None, error: Some(e), left },
        },
    };
    diag::log("screen", &format!("scan asked: corner read ({} lines, {left} more)", scan.lines.len()));
    let _ = app.emit("screen:scan", scan);
}

/// What the page is told when the window could not be captured (`Tick.error`); nothing for a minimised window.
fn capture_error_kind(e: &CaptureError) -> Option<&'static str> {
    match e {
        CaptureError::Gone => Some("no-dofus"),
        CaptureError::Minimized => None,
        CaptureError::Permission => Some("no-permission"),
        CaptureError::Failed => Some("no-capture"),
    }
}

fn timed_capture(id: WindowId, stats: &mut Stats) -> Result<Frame, CaptureError> {
    let started = Instant::now();
    let frame = platform::capture(id);
    stats.captures += 1;
    stats.capture_ms += started.elapsed().as_millis();
    frame
}

/// Watches the reference Dofus window (see TICK): emits `screen:tick` with what it read (or why it could not), and in
/// « Songe » mode `screen:songe` with the group tooltips around the resting mouse. Should the reading ever panic, it
/// is logged and started again a second later (a dead reader would silently stop the zone, fights and Songe).
pub fn start(app: AppHandle, reference: Reference, songe: Songe, in_fight: InFight, reading: Reading) {
    std::thread::spawn(move || loop {
        let (app, reference, songe, in_fight, reading) =
            (app.clone(), reference.clone(), songe.clone(), in_fight.clone(), reading.clone());
        let reader = std::thread::spawn(move || run(app, reference, songe, in_fight, reading));
        if let Err(panic) = reader.join() {
            let what = panic
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| panic.downcast_ref::<String>().cloned())
                .unwrap_or_default();
            diag::log("screen", &format!("the reader stopped ({what}): started again"));
        }
        std::thread::sleep(Duration::from_secs(1));
    });
}

fn run(app: AppHandle, reference: Reference, songe: Songe, in_fight: InFight, reading: Reading) {
    {
        let engine = platform::ocr_engine();
        let now = Instant::now();
        let mut r = Reader {
            loop_start: now,
            last_slow: None,
            last_read: None,
            read_mask: None,
            confirm: false,
            was_front: false,
            cursor: None,
            still_since: now,
            hover_tries: 0,
            bar: None,
            logged_state: String::new(),
            stats: Stats::default(),
        };
        let emit = |tick: Tick| {
            let _ = app.emit("screen:tick", tick);
        };
        let fail = |error: &str| Tick {
            front: true,
            lines: vec![],
            error: Some(error.into()),
            bar: None,
        };
        // the window's state in the log, on change only: « no Dofus », « Dofus not in front », a capture error, its size
        let note = |r: &mut Reader, state: String| {
            if r.logged_state != state {
                diag::log("screen", &state);
                r.logged_state = state;
            }
        };
        loop {
            // the icon bar when it is known, else the page's view (from the texts)
            let fighting = match r.bar {
                Some(bar) => bar == Bar::Fight,
                None => in_fight.0.load(Ordering::Relaxed),
            };
            let hovering = songe.0.load(Ordering::Relaxed) && !fighting;
            let period = if hovering { HOVER_TICK } else { TICK };
            std::thread::sleep(period.saturating_sub(r.loop_start.elapsed()));
            r.loop_start = Instant::now();
            r.stats.report();
            let slow_due = r.last_slow.is_none_or(|t| t.elapsed() >= TICK);
            if slow_due {
                r.last_slow = Some(Instant::now());
            }
            let prefix = reference.0.lock().map(|p| p.clone()).unwrap_or_default();
            let Some(target) = pick(&platform::dofus_windows(), &prefix) else {
                note(&mut r, "no Dofus window".into());
                r.was_front = false;
                if slow_due {
                    emit(fail("no-dofus"));
                }
                continue;
            };
            if !reading.0.load(Ordering::Relaxed) {
                // « Lecture de l'écran » off: no capture, not even which window is in front; turned on again, the first tick reads at once (was_front)
                note(&mut r, "reading turned off".into());
                r.was_front = false;
                if slow_due {
                    emit(fail("off"));
                    // « Scanner ma sous-zone » clicked: one reading of the corner now, the switch staying off
                    if platform::front_window() == Some(target.id) {
                        if let Some(left) = scan_due(&app, &reading.1) {
                            let frame = timed_capture(target.id, &mut r.stats).ok();
                            emit_scan(&app, engine.as_ref().ok(), frame.as_ref(), left);
                        }
                    }
                }
                continue;
            }
            if platform::front_window() != Some(target.id) {
                note(&mut r, "Dofus not in front".into());
                r.was_front = false;
                if slow_due {
                    let ours = platform::front_is_ours();
                    emit(Tick {
                        front: ours,
                        lines: vec![],
                        error: None,
                        bar: None,
                    });
                }
                continue;
            }
            let engine = match &engine {
                Ok(engine) => engine,
                Err(_) => {
                    note(&mut r, "no French OCR on this system".into());
                    if slow_due {
                        emit(fail("no-ocr"));
                    }
                    continue;
                }
            };
            let id = target.id;
            let mut frame = None;
            if slow_due {
                frame = match timed_capture(id, &mut r.stats) {
                    Ok(f) => Some(f),
                    Err(e) => {
                        note(&mut r, format!("capture failed: {e:?}"));
                        if let Some(kind) = capture_error_kind(&e) {
                            emit(fail(kind));
                        }
                        continue;
                    }
                };
                let Some((px, w, h)) = &frame else { continue };
                note(&mut r, format!("reading Dofus, {w}×{h}"));
                // « Scanner ma sous-zone » clicked with the zone not followed (its option off): this frame answers it
                if let Some(left) = scan_due(&app, &reading.1) {
                    emit_scan(&app, Some(engine), frame.as_ref(), left);
                }
                let mask = corner_mask(px, *w, *h);
                let changed = r.read_mask.as_ref().is_none_or(|m| corner_changed(m, &mask));
                let bar = read_bar(px, *w, *h);
                let bar_changed = bar != Bar::Unknown && r.bar != Some(bar);
                if bar_changed {
                    let (eye, info, heart) = scores(px, *w, *h);
                    diag::log("fight", &format!("icon bar: {bar:?} (eye {eye:.2}, i {info:.2}, heart {heart:.2})"));
                }
                if bar != Bar::Unknown {
                    r.bar = Some(bar);
                }
                let every = match (r.bar, fighting) {
                    (Some(_), _) => SAFETY_READ_EVERY,
                    (None, true) => FIGHT_READ_EVERY,
                    (None, false) => CALM_READ_EVERY,
                };
                let due = r.last_read.is_none_or(|t| t.elapsed() >= every);
                // in a fight the header is not used (the turn order and spell effects keep changing that corner)
                let changed = changed
                    && r.bar != Some(Bar::Fight)
                    && r.last_read.is_none_or(|t| t.elapsed() >= CHANGE_READ_EVERY);
                let asked = songe.1.swap(false, Ordering::Relaxed);
                if !r.was_front || r.confirm || changed || bar_changed || due || asked {
                    r.confirm = changed;
                    r.read_mask = Some(mask);
                    r.last_read = Some(Instant::now());
                    let started = Instant::now();
                    let tick = match read_corner(engine, px, *w, *h) {
                        Ok(lines) => Tick {
                            front: true,
                            lines,
                            error: None,
                            // a covered bar (the end-of-fight window, a menu) keeps the last state seen
                            bar: Some(r.bar.unwrap_or(Bar::Unknown)),
                        },
                        Err(e) => {
                            diag::log("screen", &format!("OCR error: {e}"));
                            fail(&e)
                        }
                    };
                    r.stats.reads += 1;
                    r.stats.read_ms += started.elapsed().as_millis();
                    emit(tick);
                }
                r.was_front = true;
            }
            if !hovering {
                continue;
            }
            let Some((w, h)) = frame.as_ref().map(|(_, w, h)| (*w, *h)).or_else(|| platform::client_size(id)) else {
                continue;
            };
            let Some((cx, cy)) = platform::cursor_in(id, w, h) else {
                continue;
            };
            let moved = r.cursor.is_none_or(|(x, y)| (cx - x).abs() > 3 || (cy - y).abs() > 3);
            if moved {
                r.cursor = Some((cx, cy));
                r.still_since = Instant::now();
                r.hover_tries = 0;
                continue;
            }
            if r.hover_tries >= HOVER_TRIES.len() || r.still_since.elapsed() < HOVER_TRIES[r.hover_tries] {
                continue;
            }
            r.hover_tries += 1;
            if frame.is_none() {
                frame = timed_capture(id, &mut r.stats).ok();
            }
            let Some((px, w, h)) = &frame else {
                continue;
            };
            let started = Instant::now();
            let lines = read_hovered(engine, px, *w, *h, cx, cy).unwrap_or_default();
            r.stats.hovers += 1;
            r.stats.hover_ms += started.elapsed().as_millis();
            if !lines.is_empty() {
                r.hover_tries = HOVER_TRIES.len(); // found: nothing more until the mouse moves
                let _ = app.emit("screen:songe", lines);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load(name: &str) -> (Vec<u8>, u32, u32) {
        let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
        let img = image::open(path).expect("fixture").to_rgba8();
        let (w, h) = img.dimensions();
        let mut px = img.into_raw();
        px.chunks_exact_mut(4).for_each(|p| p.swap(0, 2));
        (px, w, h)
    }

    fn texts(name: &str) -> Vec<String> {
        let (px, w, h) = load(name);
        read_frame(&platform::ocr_engine().expect("fr-FR OCR"), &px, w, h)
            .unwrap()
            .into_iter()
            .map(|l| l.text)
            .collect()
    }

    #[test]
    fn tick_error_for_each_capture_error() {
        assert_eq!(capture_error_kind(&CaptureError::Gone), Some("no-dofus"));
        assert_eq!(capture_error_kind(&CaptureError::Minimized), None); // nothing to read, nothing to say
        assert_eq!(capture_error_kind(&CaptureError::Permission), Some("no-permission"));
        assert_eq!(capture_error_kind(&CaptureError::Failed), Some("no-capture"));
    }

    #[test]
    fn group_headers_are_read_despite_misread_letters() {
        assert!(is_group_header("Niveau 132"));
        assert!(is_group_header("Niueau 468"));
        assert!(is_group_header("Level 200"));
        assert!(!is_group_header("Volkorne indigo sauvage (66)"));
        assert!(!is_group_header("103 466"));
    }

    #[test]
    #[cfg(windows)]
    fn reads_the_map_header() {
        let t = texts("header_brakmar.png");
        assert!(t.iter().any(|l| l.contains("Haras de Br")), "{t:?}");
        assert!(t.iter().any(|l| l.starts_with("-26")), "{t:?}");
    }

    #[test]
    #[cfg(windows)]
    fn reads_the_header_on_a_bright_map() {
        // full screen, a bright yellow-green map behind the header (owner, 2026-11-20): specks of grass next to
        // dark pixels used to cut the line at « (Champ•des »
        let (px, w, h) = load("header_bright_fullscreen.png");
        let lines = read_corner(&platform::ocr_engine().expect("fr-FR OCR"), &px, w, h).unwrap();
        assert!(lines.iter().any(|l| l.text.contains("Champ des Ingalsse)")), "{:?}", lines.iter().map(|l| &l.text).collect::<Vec<_>>());
    }

    #[test]
    #[cfg(windows)]
    fn reads_the_header_and_coordinates_on_snow() {
        // windowed, white snow behind the header (owner, 2026-11-20, Entrée du château de Harebourg)
        let (px, w, h) = load("header_snow_windowed.png");
        let lines = read_corner(&platform::ocr_engine().expect("fr-FR OCR"), &px, w, h).unwrap();
        let texts: Vec<&str> = lines.iter().map(|l| l.text.as_str()).collect();
        assert!(texts.iter().any(|t| t.contains("Harebourg)")), "{texts:?}");
        assert!(texts.iter().any(|t| has_coordinates(t) && t.contains("68") && t.contains("78")), "{texts:?}");
    }

    #[test]
    #[cfg(windows)]
    fn reads_the_fight_buttons() {
        assert!(
            texts("button_fin_de_tour.png")
                .iter()
                .any(|l| l == "FIN DE TOUR")
        );
        assert!(
            texts("button_challenges.png")
                .iter()
                .any(|l| l.contains("CHALLENGES"))
        );
    }

    #[test]
    fn a_black_capture_is_blank() {
        assert!(is_blank(&vec![0u8; 400 * 300 * 4]));
        // a dark game frame still has lit pixels here and there (text, light effects): 1 pixel in 50
        let mut frame = vec![0u8; 400 * 300 * 4];
        for i in (0..400 * 300).step_by(50) {
            frame[i * 4 + 2] = 120;
        }
        assert!(!is_blank(&frame));
    }

    #[test]
    fn coordinates_are_recognised_at_a_line_start() {
        assert!(has_coordinates("3,26 • Niveau 30"));
        assert!(has_coordinates("-16, 19"));
        assert!(has_coordinates("–2.40 - Niveau 1"));
        assert!(!has_coordinates("Amakna (Plaine des Scarafeuilles)"));
        assert!(!has_coordinates("Palier I · Profondeur 1"));
    }

    #[test]
    fn outlined_text_keeps_light_pixels_next_to_a_dark_outline_only() {
        // a 12×12 picture: light everywhere (a bright map), with one dark outline pixel at (6,6)
        let mut px = vec![240u8; 12 * 12 * 4];
        for c in 0..3 {
            px[(6 * 12 + 6) * 4 + c] = 20;
        }
        let (img, w, _) = outlined_text(&px, 12, 12);
        let black = |x: u32, y: u32| img[(((y * SCALE) * w + x * SCALE) * 4) as usize] == 0;
        assert!(black(5, 6) && black(8, 8)); // light, within 3 px of the outline: text
        assert!(!black(0, 0) && !black(11, 11)); // light but far from any outline: the scenery
    }

    #[test]
    fn corner_size_scales_with_the_window_and_stays_inside() {
        assert_eq!(corner_size(1920, 1009), (720, 300));
        assert_eq!(corner_size(3840, 2018), (1440, 600));
        assert_eq!(corner_size(500, 280), (500, 280));
    }

    #[test]
    fn light_text_keeps_only_light_pixels() {
        let px = [250u8, 250, 250, 255, 10, 10, 10, 255];
        let (out, w, h) = light_text(&px, 2, 1);
        assert_eq!((w, h), (4, 2));
        assert_eq!(&out[0..3], &[0, 0, 0]);
        assert_eq!(&out[8..11], &[255, 255, 255]);
    }
}
