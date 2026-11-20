//! The macOS reading's plain arithmetic, compiled everywhere so its tests run on Windows too: which windows are the
//! game's, Vision's boxes in frame pixels, a Retina frame's size.

use super::{DofusWindow, WindowId};

/// One on-screen window as CoreGraphics lists it (`CGWindowListCopyWindowInfo`).
#[derive(Debug, Clone, PartialEq)]
pub struct WindowEntry {
    pub id: u32,
    pub pid: i32,
    pub owner: String,
    pub title: String,
    pub layer: i32,
    pub on_screen: bool,
}

/// The game's windows among `entries` (front first, as listed): owner « Dofus », normal layer (0: not its menus or
/// tooltips), on screen. Without the screen-recording permission macOS gives no titles: « Dofus » then.
pub fn dofus_entries(entries: &[WindowEntry]) -> Vec<DofusWindow> {
    entries
        .iter()
        .filter(|e| e.owner.eq_ignore_ascii_case("dofus") && e.layer == 0 && e.on_screen)
        .map(|e| DofusWindow {
            id: e.id as WindowId,
            title: if e.title.is_empty() { "Dofus".into() } else { e.title.clone() },
        })
        .collect()
}

/// A frame of `pixel_w` × `pixel_h` pixels on a screen of backing `scale`, in points (one pixel per point).
pub fn frame_size_in_points(pixel_w: u32, pixel_h: u32, scale: f64) -> (u32, u32) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    ((pixel_w as f64 / scale).round() as u32, (pixel_h as f64 / scale).round() as u32)
}

/// A Vision box (x, y, width, height, normalised, origin at the bottom left) in frame pixels (x, y, w, h, origin at
/// the top left).
pub fn vision_box_to_frame(b: (f64, f64, f64, f64), width: u32, height: u32) -> (i32, i32, i32, i32) {
    let (w, h) = (width as f64, height as f64);
    (
        (b.0 * w).round() as i32,
        ((1.0 - b.1 - b.3) * h).round() as i32,
        (b.2 * w).round() as i32,
        (b.3 * h).round() as i32,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: u32, owner: &str, title: &str, layer: i32, on_screen: bool) -> WindowEntry {
        WindowEntry { id, pid: 7, owner: owner.into(), title: title.into(), layer, on_screen }
    }

    #[test]
    fn keeps_only_dofus_game_windows() {
        let list = dofus_entries(&[
            entry(1, "Dofus", "Perso - Iop - 3.4 - Release", 0, true),
            entry(2, "Dofus", "", 25, true),
            entry(3, "Finder", "Documents", 0, true),
            entry(4, "Dofus", "Autre - Cra - 3.4 - Release", 0, false),
            entry(5, "dofus", "", 0, true),
        ]);
        let got: Vec<(isize, &str)> = list.iter().map(|w| (w.id, w.title.as_str())).collect();
        assert_eq!(got, vec![(1, "Perso - Iop - 3.4 - Release"), (5, "Dofus")]);
    }

    #[test]
    fn retina_frames_are_sized_in_points() {
        assert_eq!(frame_size_in_points(2880, 1800, 2.0), (1440, 900));
        assert_eq!(frame_size_in_points(1440, 900, 1.0), (1440, 900));
    }

    #[test]
    fn vision_boxes_in_frame_pixels() {
        assert_eq!(vision_box_to_frame((0.1, 0.8, 0.5, 0.1), 1000, 500), (100, 50, 500, 50));
    }
}
