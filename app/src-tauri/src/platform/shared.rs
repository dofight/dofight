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
    /// 0 for a window that draws nothing
    pub alpha: f64,
}

/// The game's windows among `entries` (front first, as listed): owner « Dofus », normal layer (0: not its menus or
/// tooltips), on screen and not transparent (full screen adds one in front of the game, see the tests). Without the
/// screen-recording permission macOS gives no titles: « Dofus » then.
pub fn dofus_entries(entries: &[WindowEntry]) -> Vec<DofusWindow> {
    entries
        .iter()
        .filter(|e| e.owner.eq_ignore_ascii_case("dofus") && e.layer == 0 && e.on_screen && e.alpha > 0.0)
        .map(|e| DofusWindow {
            id: e.id as WindowId,
            title: if e.title.is_empty() { "Dofus".into() } else { e.title.clone() },
        })
        .collect()
}

/// A window's frame as the window list gives it: x, y, width, height in points, origin at the top left of the main
/// display.
pub type Rect = (f64, f64, f64, f64);

/// How far above `frame` ScreenCaptureKit's picture of a full-screen `game` starts (points). macOS keeps the title
/// bar of a full-screen window in a transparent window of the same app, right above the screen, and ScreenCaptureKit
/// draws the game's window from the top of that strip: asked for the frame at (0, 0), it gave 44 black rows and the
/// game 44 points too low, the icon bar out of the corner (owner's Mac, 1920×1080 at 1x, 2026-11-28). The strip's
/// height, 0 without one.
pub fn hidden_title_bar(game: &WindowEntry, frame: Rect, list: &[(WindowEntry, Rect)]) -> f64 {
    list.iter()
        .find(|(e, (x, y, w, h))| {
            e.pid == game.pid && e.id != game.id && e.alpha == 0.0 && *x == frame.0 && *w == frame.2 && (y + h - frame.1).abs() < 0.5
        })
        .map_or(0.0, |(_, strip)| strip.3)
}

/// Where a saved window goes back to (points): its place when enough of it would show on one of `displays` to grab it
/// again (40 × 40 points, or all of it when smaller), otherwise none and macOS places it (a screen unplugged since).
pub fn restored_position(saved: Rect, displays: &[Display]) -> Option<(f64, f64)> {
    let (x, y, w, h) = saved;
    let need = (w.min(40.0), h.min(40.0));
    displays
        .iter()
        .any(|&((dx, dy, dw, dh), _)| {
            let ow = (x + w).min(dx + dw) - x.max(dx);
            let oh = (y + h).min(dy + dh) - y.max(dy);
            ow >= need.0 && oh >= need.1
        })
        .then_some((x, y))
}

/// A window saved by tauri-plugin-window-state (pixels, `(x, y, width, height)`), in points. The plugin wrote each
/// value at the scale of the screen the window was on, which the file does not say: the scale kept is the one whose
/// display holds the window once divided by it (a Retina-only Mac: 2, the window lands on its own screen; a 1x
/// screen: 1). None when no scale fits.
pub fn migrated(saved: Rect, displays: &[Display]) -> Option<Rect> {
    let (x, y, w, h) = saved;
    let mut scales: Vec<u32> = displays.iter().map(|&(_, s)| s).collect();
    scales.sort_unstable_by(|a, b| b.cmp(a));
    scales.dedup();
    scales.into_iter().find_map(|s| {
        let f = s as f64;
        let rect = (x / f, y / f, w / f, h / f);
        (window_scale(rect, displays, 0) == s).then_some(rect)
    })
}

/// A frame of `pixel_w` × `pixel_h` pixels on a screen of backing `scale`, in points (one pixel per point).
pub fn frame_size_in_points(pixel_w: u32, pixel_h: u32, scale: f64) -> (u32, u32) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    ((pixel_w as f64 / scale).round() as u32, (pixel_h as f64 / scale).round() as u32)
}

/// A display: its bounds (x, y, width, height in points, origin at the top left of the main display, as the window
/// list gives a window's frame) and how many pixels it draws per point (2 on a Retina screen, 1 elsewhere).
pub type Display = ((f64, f64, f64, f64), u32);

/// A display's pixels per point, from its mode: pixel width over width in points.
pub fn display_scale(pixel_width: u64, width: u64) -> u32 {
    if width == 0 { 1 } else { ((pixel_width as f64 / width as f64).round() as u32).max(1) }
}

/// The scale of the display holding most of `frame` (points), `fallback` when it is on none of `displays`. A Mac
/// may have a Retina screen beside one that is not: a window is captured at its own display's pixels, not at the
/// main display's. Asked for twice its own pixels, a 1x screen comes back interpolated, and the header text the
/// reading looks for (pure white cores in a dark outline) is blurred out of it (Discord, 2026-11-26).
pub fn window_scale(frame: (f64, f64, f64, f64), displays: &[Display], fallback: u32) -> u32 {
    let (x, y, w, h) = frame;
    let overlap = |(dx, dy, dw, dh): (f64, f64, f64, f64)| {
        let ow = (x + w).min(dx + dw) - x.max(dx);
        let oh = (y + h).min(dy + dh) - y.max(dy);
        if ow > 0.0 && oh > 0.0 { ow * oh } else { 0.0 }
    };
    displays
        .iter()
        .map(|&(bounds, scale)| (overlap(bounds), scale))
        .filter(|&(area, _)| area > 0.0)
        .max_by(|a, b| a.0.total_cmp(&b.0))
        .map_or(fallback, |(_, scale)| scale.max(1))
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
        WindowEntry { id, pid: 7, owner: owner.into(), title: title.into(), layer, on_screen, alpha: 1.0 }
    }

    // Dofus in full screen on a Mac's main display lists, in front of the game, an untitled window of its own: the
    // strip the title bar slides down from, 1920×44 above the screen (y -44) and fully transparent. It was taken
    // for the game, its corner came back black and no zone was ever read (owner's Mac, 1x main display, 2026-11-28)
    #[test]
    fn an_invisible_dofus_window_is_not_the_game() {
        let strip = WindowEntry { alpha: 0.0, ..entry(191, "Dofus", "", 0, true) };
        let list = dofus_entries(&[strip, entry(179, "Dofus", "Perso - Forgelance - 3.7 - Release", 0, true)]);
        let got: Vec<isize> = list.iter().map(|w| w.id).collect();
        assert_eq!(got, vec![179]);
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
    fn a_full_screen_game_is_captured_from_the_top_of_its_hidden_title_bar() {
        let game = entry(179, "Dofus", "Perso - Forgelance - 3.7 - Release", 0, true);
        let strip = WindowEntry { alpha: 0.0, ..entry(191, "Dofus", "", 0, true) };
        let frame = (0.0, 0.0, 1920.0, 1080.0);
        let list = [(strip.clone(), (0.0, -44.0, 1920.0, 44.0)), (game.clone(), frame)];
        assert_eq!(hidden_title_bar(&game, frame, &list), 44.0);
        // windowed, or another app's strip, or a strip that is not above it: nothing
        assert_eq!(hidden_title_bar(&game, frame, &[(game.clone(), frame)]), 0.0);
        let other = WindowEntry { pid: 8, ..strip.clone() };
        assert_eq!(hidden_title_bar(&game, frame, &[(other, (0.0, -44.0, 1920.0, 44.0))]), 0.0);
        assert_eq!(hidden_title_bar(&game, frame, &[(strip, (1920.0, -44.0, 1440.0, 44.0))]), 0.0);
    }

    // the owner's Mac: a 1x VG248 as main display, the MacBook's Retina screen on its left
    const MAIN_1X: Display = ((0.0, 0.0, 1920.0, 1080.0), 1);
    const LEFT_RETINA: Display = ((-1440.0, 0.0, 1440.0, 900.0), 2);

    #[test]
    fn a_window_comes_back_where_it_was_while_its_screen_is_there() {
        let displays = [MAIN_1X, LEFT_RETINA];
        assert_eq!(restored_position((839.0, 79.0, 240.0, 348.0), &displays), Some((839.0, 79.0)));
        assert_eq!(restored_position((-1300.0, 50.0, 240.0, 600.0), &displays), Some((-1300.0, 50.0)));
        // its screen unplugged: macOS places it
        assert_eq!(restored_position((-1300.0, 50.0, 240.0, 600.0), &[MAIN_1X]), None);
        // a sliver left on screen is not enough to grab it again
        assert_eq!(restored_position((1900.0, 79.0, 240.0, 348.0), &[MAIN_1X]), None);
    }

    // tauri-plugin-window-state saved pixels at the scale of the screen the window was on, and restored them at the
    // scale of the screen macOS made it on: the panel saved as 307×814 at (1609, 109) on the 1x screen came back at
    // 154×407 at (804, 55), made on the Retina one (owner's Mac, 2026-11-28)
    #[test]
    fn an_old_saved_place_is_read_back_in_points() {
        // a Retina-only Mac: everything was saved at 2
        let built_in = ((0.0, 0.0, 1512.0, 982.0), 2);
        assert_eq!(migrated((2400.0, 80.0, 680.0, 1800.0), &[built_in]), Some((1200.0, 40.0, 340.0, 900.0)));
        // a 1x screen only: as saved
        assert_eq!(migrated((839.0, 79.0, 240.0, 348.0), &[MAIN_1X]), Some((839.0, 79.0, 240.0, 348.0)));
        // on the Retina screen of a mixed Mac
        assert_eq!(migrated((-2600.0, 100.0, 480.0, 1200.0), &[MAIN_1X, LEFT_RETINA]), Some((-1300.0, 50.0, 240.0, 600.0)));
        // on no screen at any scale
        assert_eq!(migrated((90000.0, 0.0, 240.0, 348.0), &[MAIN_1X, LEFT_RETINA]), None);
    }

    #[test]
    fn retina_frames_are_sized_in_points() {
        assert_eq!(frame_size_in_points(2880, 1800, 2.0), (1440, 900));
        assert_eq!(frame_size_in_points(1440, 900, 1.0), (1440, 900));
    }

    // a player's MacBook (Retina, 2 pixels a point) set as the main display, with Dofus on an external 2560×1440
    // monitor beside it (1 pixel a point): the main display's scale was used for every capture, so that game was
    // captured at twice its own pixels and its header was never read (Discord, 2026-11-26)
    const BUILT_IN: Display = ((0.0, 0.0, 1512.0, 982.0), 2);
    const EXTERNAL: Display = ((1512.0, -200.0, 2560.0, 1440.0), 1);

    #[test]
    fn a_window_is_captured_at_its_own_display_scale() {
        let displays = [BUILT_IN, EXTERNAL];
        assert_eq!(window_scale((1512.0, -170.0, 2560.0, 1410.0), &displays, 2), 1);
        assert_eq!(window_scale((100.0, 30.0, 1200.0, 800.0), &displays, 1), 2);
    }

    #[test]
    fn a_window_across_two_displays_takes_the_one_holding_most_of_it() {
        let displays = [BUILT_IN, EXTERNAL];
        // 412 points on the built-in display, 1100 on the external one
        assert_eq!(window_scale((1100.0, 100.0, 1512.0, 800.0), &displays, 2), 1);
    }

    #[test]
    fn a_window_on_no_known_display_keeps_the_fallback() {
        assert_eq!(window_scale((5000.0, 5000.0, 800.0, 600.0), &[BUILT_IN, EXTERNAL], 2), 2);
        assert_eq!(window_scale((0.0, 0.0, 800.0, 600.0), &[], 1), 1);
    }

    #[test]
    fn a_display_scale_is_its_pixels_per_point() {
        assert_eq!(display_scale(3024, 1512), 2);
        assert_eq!(display_scale(2560, 2560), 1);
        assert_eq!(display_scale(0, 0), 1);
    }

    #[test]
    fn vision_boxes_in_frame_pixels() {
        assert_eq!(vision_box_to_frame((0.1, 0.8, 0.5, 0.1), 1000, 500), (100, 50, 500, 50));
    }
}
