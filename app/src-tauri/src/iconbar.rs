//! In a fight or not, from Dofus's top-left icon bar: the eye and the « i » show only out of a fight (the Havre-Sac
//! bar has the « i » but no eye), the heart only in a fight (see iconbar_refs.rs). No text is read, so it works whatever the game's language, and it costs a few milliseconds.
//! When neither icon is there (a window covers the bar, or it is folded away), the answer is « unknown » and the
//! texts decide, as before.
//!
//! The icons are compared by normalised correlation of grey levels (a lit, a greyed or an orange icon of the same
//! shape match alike), anywhere in the top-left corner (the bar may sit a little elsewhere). On ~220 saved frames
//! the real icons score 0.95 or more and everything else under 0.8.

use crate::iconbar_refs::{
    EYE, EYE_B, EYE_H, EYE_W, HEART, HEART_B, HEART_H, HEART_W, ICON_FRAME_H, INFO, INFO_H, INFO_W,
};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Bar {
    Fight,
    Calm,
    Unknown,
}

/// Where the icons are looked for (frame pixels at ICON_FRAME_H high).
const AREA_W: u32 = 260;
const AREA_H: u32 = 44;
/// A correlation at least this high is the icon.
const MATCH: f32 = 0.9;

/// The top-left corner in grey levels, scaled to the icons' frame height. `bgra` is `width` × `height` from the
/// window's top left (the whole window, or only its header corner); `window_h` is the window's height.
fn corner(bgra: &[u8], width: u32, height: u32, window_h: u32) -> Option<Vec<f32>> {
    let scale = window_h as f32 / ICON_FRAME_H as f32;
    // the window's own corner, far enough in to hold the area once it is scaled back up
    if (AREA_W as f32 * scale) as u32 >= width || (AREA_H as f32 * scale) as u32 >= height {
        return None;
    }
    let grey = |x: u32, y: u32| {
        let i = ((y.min(height - 1) * width + x.min(width - 1)) * 4) as usize;
        (bgra[i] as u32 * 114 + bgra[i + 1] as u32 * 587 + bgra[i + 2] as u32 * 299) as f32 / 1000.0
    };
    let mut out = Vec::with_capacity((AREA_W * AREA_H) as usize);
    for y in 0..AREA_H {
        for x in 0..AREA_W {
            // each pixel mixed from the four around it, never the nearest one: the icons are drawn at the window's
            // own size, so anything but a 1009-pixel-high game lands between pixels. Taking the nearest dropped the
            // eye of a calm bar from 0.99 to 0.89 and its « i » from 1.00 to 0.91 at a 847-pixel-high window, a hair
            // over the 0.90 a match needs, and under it at 800 — where no fight was seen at all (owner, 2026-11-21).
            let (fx, fy) = (x as f32 * scale, y as f32 * scale);
            let (x0, y0) = (fx.floor() as u32, fy.floor() as u32);
            let (tx, ty) = (fx - x0 as f32, fy - y0 as f32);
            let above = grey(x0, y0) * (1.0 - tx) + grey(x0 + 1, y0) * tx;
            let below = grey(x0, y0 + 1) * (1.0 - tx) + grey(x0 + 1, y0 + 1) * tx;
            out.push(above * (1.0 - ty) + below * ty);
        }
    }
    Some(out)
}

/// The icon's grey levels minus their mean, and their norm.
fn centred(icon: &[u8]) -> (Vec<f32>, f32) {
    let mean = icon.iter().map(|&v| v as f32).sum::<f32>() / icon.len() as f32;
    let c: Vec<f32> = icon.iter().map(|&v| v as f32 - mean).collect();
    let norm = c.iter().map(|v| v * v).sum::<f32>().sqrt();
    (c, norm)
}

/// Best normalised correlation anywhere in the corner, over every known look of the icon.
///
/// One saved look is not enough: the eye taken from the saved Windows frames scores 0.89 on what the owner's Mac
/// captures, a hair under the 0.90 a match needs. The looks are walked together at each place rather than one after
/// the other, so the patch and its mean are worked out once however many there are (owner, 2026-11-21).
fn best(area: &[f32], looks: &[&[u8]], w: u32, h: u32) -> f32 {
    let centred: Vec<(Vec<f32>, f32)> = looks.iter().map(|icon| centred(icon)).collect();
    let n = (w * h) as f32;
    let mut top = 0f32;
    let mut patch = vec![0f32; (w * h) as usize];
    for y0 in 0..=AREA_H - h {
        for x0 in 0..=AREA_W - w {
            let mut sum = 0f32;
            for y in 0..h {
                let row = ((y0 + y) * AREA_W + x0) as usize;
                let line = &area[row..row + w as usize];
                sum += line.iter().sum::<f32>();
                patch[(y * w) as usize..((y + 1) * w) as usize].copy_from_slice(line);
            }
            let mean = sum / n;
            let mut var = 0f32;
            for p in patch.iter_mut() {
                *p -= mean;
                var += *p * *p;
            }
            if var <= 0.0 {
                continue;
            }
            let spread = var.sqrt();
            for (t, t_norm) in &centred {
                let num: f32 = patch.iter().zip(t).map(|(d, v)| d * v).sum();
                top = top.max(num / (spread * t_norm));
            }
        }
    }
    top
}

/// How much the eye, the « i » and the heart are seen (0..1).
pub fn scores(bgra: &[u8], width: u32, height: u32) -> (f32, f32, f32) {
    scores_in(bgra, width, height, height)
}

/// `scores` on the window's top-left piece only (the header corner captured alone), the window being `window_h` high.
pub fn scores_in(bgra: &[u8], width: u32, height: u32, window_h: u32) -> (f32, f32, f32) {
    match corner(bgra, width, height, window_h) {
        Some(area) => (
            best(&area, &[&EYE, &EYE_B], EYE_W, EYE_H),
            best(&area, &[&INFO], INFO_W, INFO_H),
            best(&area, &[&HEART, &HEART_B], HEART_W, HEART_H),
        ),
        None => (0.0, 0.0, 0.0),
    }
}

pub fn read_bar(bgra: &[u8], width: u32, height: u32) -> Bar {
    read_bar_in(bgra, width, height, height)
}

/// `read_bar` on the window's top-left piece only, the window being `window_h` high.
pub fn read_bar_in(bgra: &[u8], width: u32, height: u32, window_h: u32) -> Bar {
    let (eye, info, heart) = scores_in(bgra, width, height, window_h);
    match (eye >= MATCH || info >= MATCH, heart >= MATCH) {
        (true, false) => Bar::Calm,
        (false, true) => Bar::Fight,
        _ => Bar::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The saved corner crops (200×34, top left of 1920×1009 frames) are pasted into a frame of that size.
    fn frame(name: &str) -> (Vec<u8>, u32, u32) {
        let path = format!("{}/tests/fixtures/iconbar/{name}", env!("CARGO_MANIFEST_DIR"));
        let img = image::open(path).unwrap().to_rgba8();
        let (w, h) = (1920u32, 1009u32);
        let mut px = vec![0u8; (w * h * 4) as usize];
        for (x, y, p) in img.enumerate_pixels() {
            let i = ((y * w + x) * 4) as usize;
            px[i..i + 4].copy_from_slice(&[p[2], p[1], p[0], 255]);
        }
        (px, w, h)
    }

    #[test]
    fn tells_fights_from_calm_by_the_eye_the_info_and_the_heart() {
        let dir = format!("{}/tests/fixtures/iconbar", env!("CARGO_MANIFEST_DIR"));
        let mut checked = 0;
        for entry in std::fs::read_dir(dir).unwrap() {
            let name = entry.unwrap().file_name().into_string().unwrap();
            let expected = match name.split('_').next().unwrap() {
                "fight" => Bar::Fight,
                "calm" => Bar::Calm,
                _ => Bar::Unknown, // covered or folded bar
            };
            let (px, w, h) = frame(&name);
            assert_eq!(read_bar(&px, w, h), expected, "{name}: eye, info, heart {:?}", scores(&px, w, h));
            checked += 1;
        }
        assert!(checked >= 10);
    }

    /// A frame rendered smaller, as the game draws its icons in a smaller window: the closest stand-in there is for
    /// a game played at anything but 1009 pixels high.
    fn smaller(px: &[u8], w: u32, h: u32, nh: u32) -> (Vec<u8>, u32, u32) {
        let nw = (w as f32 * nh as f32 / h as f32).round() as u32;
        let mut out = vec![0u8; (nw * nh * 4) as usize];
        let at = |x: i64, y: i64, c: usize| px[((y.clamp(0, h as i64 - 1) * w as i64 + x.clamp(0, w as i64 - 1)) * 4) as usize + c] as f32;
        for y in 0..nh {
            for x in 0..nw {
                let (fx, fy) = ((x as f32 + 0.5) * w as f32 / nw as f32 - 0.5, (y as f32 + 0.5) * h as f32 / nh as f32 - 0.5);
                let (x0, y0) = (fx.floor() as i64, fy.floor() as i64);
                let (tx, ty) = (fx - x0 as f32, fy - y0 as f32);
                for c in 0..3 {
                    let a = at(x0, y0, c) * (1.0 - tx) + at(x0 + 1, y0, c) * tx;
                    let b = at(x0, y0 + 1, c) * (1.0 - tx) + at(x0 + 1, y0 + 1, c) * tx;
                    out[((y * nw + x) * 4) as usize + c] = (a * (1.0 - ty) + b * ty).round() as u8;
                }
                out[((y * nw + x) * 4) as usize + 3] = 255;
            }
        }
        (out, nw, nh)
    }

    #[test]
    fn tells_fights_from_calm_in_a_smaller_window_too() {
        // the saved frames are 1009 pixels high, the height the icons were measured at, so nothing but this test
        // ever asks what happens between pixels. A Mac windowed game is 847 high and saw no fight at all: the eye of
        // a calm bar scored 0.89 and its « i » 0.91 against the 0.90 a match needs, and 0.88 and 0.89 at 800
        // (owner, 2026-11-21). The icons are read between pixels now, and the scores are back above 0.95.
        let dir = format!("{}/tests/fixtures/iconbar", env!("CARGO_MANIFEST_DIR"));
        for entry in std::fs::read_dir(dir).unwrap() {
            let name = entry.unwrap().file_name().into_string().unwrap();
            let expected = match name.split('_').next().unwrap() {
                "fight" => Bar::Fight,
                "calm" => Bar::Calm,
                _ => continue, // a covered or folded bar: nothing to find at any size
            };
            let (px, w, h) = frame(&name);
            for nh in [950, 847, 800] {
                let (small, sw, sh) = smaller(&px, w, h, nh);
                assert_eq!(read_bar(&small, sw, sh), expected, "{name} at {nh} high: eye, info, heart {:?}", scores(&small, sw, sh));
            }
        }
    }

    #[test]
    fn tells_fights_from_calm_on_the_macs_own_capture() {
        // What the owner's Mac really captures: the eye of a calm bar scored 0.894 there against the 0.90 a match
        // needs — it answered, but by a hair, and no test held anything but the saved Windows frames. These two are
        // the icon bar alone, 240 × 40 of a 1440×847 game's corner: no name of any kind is in them.
        //
        // Not a theme: all eleven of the game's themes score the same (0.94, 0.98, 0.76). This is a Retina window
        // asked for at point size, which comes back softer than a frame saved on Windows (owner, 2026-11-21).
        //
        // Its « i » is deliberately not among the looks: a round disc with a small mark, close enough to other
        // round things that adding it read a menu covering the bar as a calm bar (0.915).
        let dir = format!("{}/tests/fixtures/iconbar-mac", env!("CARGO_MANIFEST_DIR"));
        let mut checked = 0;
        for entry in std::fs::read_dir(dir).unwrap() {
            let name = entry.unwrap().file_name().into_string().unwrap();
            let expected = if name.starts_with("fight") { Bar::Fight } else { Bar::Calm };
            let window_h: u32 = name.trim_end_matches(".png").rsplit('_').next().unwrap().parse().unwrap();
            let img = image::open(format!("{}/tests/fixtures/iconbar-mac/{name}", env!("CARGO_MANIFEST_DIR")))
                .unwrap()
                .to_rgba8();
            let (w, h) = img.dimensions();
            let mut px = vec![0u8; (w * h * 4) as usize];
            for (x, y, p) in img.enumerate_pixels() {
                let i = ((y * w + x) * 4) as usize;
                px[i..i + 4].copy_from_slice(&[p[2], p[1], p[0], 255]);
            }
            assert_eq!(
                read_bar_in(&px, w, h, window_h),
                expected,
                "{name}: eye, info, heart {:?}",
                scores_in(&px, w, h, window_h)
            );
            checked += 1;
        }
        assert_eq!(checked, 2);
    }

    #[test]
    fn reads_the_bar_on_the_header_corner_alone() {
        // only the header corner is captured (owner, 2026-11-20): every saved frame gets the same answer from it
        let dir = format!("{}/tests/fixtures/iconbar", env!("CARGO_MANIFEST_DIR"));
        for entry in std::fs::read_dir(dir).unwrap() {
            let name = entry.unwrap().file_name().into_string().unwrap();
            let (px, w, h) = frame(&name);
            let (cw, ch) = crate::screen::corner_size(w, h);
            let mut piece = Vec::new();
            for y in 0..ch {
                let start = (y * w * 4) as usize;
                piece.extend_from_slice(&px[start..start + (cw * 4) as usize]);
            }
            assert_eq!(read_bar_in(&piece, cw, ch, h), read_bar(&px, w, h), "{name}");
        }
    }
}

