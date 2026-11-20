//! In a fight or not, from Dofus's top-left icon bar: the eye and the « i » show only out of a fight (the Havre-Sac
//! bar has the « i » but no eye), the heart only in a fight (see iconbar_refs.rs). No text is read, so it works whatever the game's language, and it costs a few milliseconds.
//! When neither icon is there (a window covers the bar, or it is folded away), the answer is « unknown » and the
//! texts decide, as before.
//!
//! The icons are compared by normalised correlation of grey levels (a lit, a greyed or an orange icon of the same
//! shape match alike), anywhere in the top-left corner (the bar may sit a little elsewhere). On ~220 saved frames
//! the real icons score 0.95 or more and everything else under 0.8.

use crate::iconbar_refs::{EYE, EYE_H, EYE_W, HEART, HEART_H, HEART_W, ICON_FRAME_H, INFO, INFO_H, INFO_W};
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
    let mut out = Vec::with_capacity((AREA_W * AREA_H) as usize);
    for y in 0..AREA_H {
        for x in 0..AREA_W {
            let fx = (x as f32 * scale) as u32;
            let fy = (y as f32 * scale) as u32;
            if fx >= width || fy >= height {
                return None;
            }
            let i = ((fy * width + fx) * 4) as usize;
            out.push((bgra[i] as u32 * 114 + bgra[i + 1] as u32 * 587 + bgra[i + 2] as u32 * 299) as f32 / 1000.0);
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

/// Best normalised correlation of the icon anywhere in the corner.
fn best(area: &[f32], icon: &[u8], w: u32, h: u32) -> f32 {
    let (t, t_norm) = centred(icon);
    let n = (w * h) as f32;
    let mut top = 0f32;
    for y0 in 0..=AREA_H - h {
        for x0 in 0..=AREA_W - w {
            let mut sum = 0f32;
            for y in 0..h {
                let row = ((y0 + y) * AREA_W + x0) as usize;
                sum += area[row..row + w as usize].iter().sum::<f32>();
            }
            let mean = sum / n;
            let (mut num, mut var) = (0f32, 0f32);
            for y in 0..h {
                let row = ((y0 + y) * AREA_W + x0) as usize;
                for x in 0..w as usize {
                    let d = area[row + x] - mean;
                    num += d * t[(y * w) as usize + x];
                    var += d * d;
                }
            }
            if var > 0.0 {
                top = top.max(num / (var.sqrt() * t_norm));
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
            best(&area, &EYE, EYE_W, EYE_H),
            best(&area, &INFO, INFO_W, INFO_H),
            best(&area, &HEART, HEART_W, HEART_H),
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
