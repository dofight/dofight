//! macOS: Dofight is a menu-bar app (no Dock icon); its panel floats over every Space, full-screen Dofus included,
//! without taking the focus from the game. The Dofus window is found with CoreGraphics' window list, captured with
//! ScreenCaptureKit and read with Vision. Nothing is ever sent to the game.

use super::{CaptureError, DofusWindow, Frame, WindowEntry, WindowId, dofus_entries};
use core_foundation::base::{CFType, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::CFDictionary;
use core_foundation::number::CFNumber;
use core_foundation::string::CFString;
use core_graphics::event::CGEvent;
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use core_graphics::geometry::CGRect;
use core_graphics::window::{
    copy_window_info, kCGNullWindowID, kCGWindowBounds, kCGWindowIsOnscreen, kCGWindowLayer,
    kCGWindowListExcludeDesktopElements, kCGWindowListOptionOnScreenOnly, kCGWindowName, kCGWindowNumber,
    kCGWindowOwnerName, kCGWindowOwnerPID,
};
use crate::ocr::OcrLine;
use objc2_app_kit::{
    NSApplicationActivationOptions, NSFloatingWindowLevel, NSRunningApplication, NSWindow, NSWindowCollectionBehavior,
    NSWorkspace,
};
use tauri::Manager;

/// A windowed game's title bar (points): part of the window's frame, not of what Windows calls the client area. Left
/// out so the header corner and the icon bar sit where they do on Windows. To tune on a real Mac.
const TITLE_BAR: f64 = 28.0;

/// A listed window and its frame (x, y, width, height in points, origin at the top left of the main screen).
fn window_list() -> Vec<(WindowEntry, (f64, f64, f64, f64))> {
    let Some(list) = copy_window_info(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in list.iter() {
        // SAFETY: each item of the window list is a CFDictionary of CFString keys
        let dict: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_get_rule(*item as _) };
        let get = |key| dict.find(unsafe { CFString::wrap_under_get_rule(key) });
        let text = |key| get(key).and_then(|v| v.downcast::<CFString>()).map(|s| s.to_string()).unwrap_or_default();
        let int = |key| get(key).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_i64()).unwrap_or(0);
        let on_screen = get(unsafe { kCGWindowIsOnscreen }).and_then(|v| v.downcast::<CFBoolean>()).map(bool::from).unwrap_or(false);
        let bounds = get(unsafe { kCGWindowBounds })
            .and_then(|v| v.downcast::<CFDictionary>())
            .and_then(|d| CGRect::from_dict_representation(&d))
            .map(|r| (r.origin.x, r.origin.y, r.size.width, r.size.height))
            .unwrap_or_default();
        out.push((
            WindowEntry {
                id: int(unsafe { kCGWindowNumber }) as u32,
                pid: int(unsafe { kCGWindowOwnerPID }) as i32,
                owner: text(unsafe { kCGWindowOwnerName }),
                title: text(unsafe { kCGWindowName }),
                layer: int(unsafe { kCGWindowLayer }) as i32,
                on_screen,
            },
            bounds,
        ));
    }
    out
}

fn entry(id: WindowId) -> Option<(WindowEntry, (f64, f64, f64, f64))> {
    window_list().into_iter().find(|(e, _)| e.id as WindowId == id)
}

/// Visible Dofus windows, front first.
pub fn dofus_windows() -> Vec<DofusWindow> {
    let entries: Vec<WindowEntry> = window_list().into_iter().map(|(e, _)| e).collect();
    dofus_entries(&entries)
}

fn frontmost_pid() -> Option<i32> {
    let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    Some(app.processIdentifier())
}

/// The front application's front window (its first one in the list).
pub fn front_window() -> Option<WindowId> {
    let pid = frontmost_pid()?;
    window_list().into_iter().find(|(e, _)| e.pid == pid && e.layer == 0).map(|(e, _)| e.id as WindowId)
}

/// Dofight itself is the front application (the player is using the panel).
pub fn front_is_ours() -> bool {
    frontmost_pid() == Some(std::process::id() as i32)
}

/// Brings the window's application in front: an activation only, nothing is sent to the game.
pub fn focus(id: WindowId) -> bool {
    let Some((e, _)) = entry(id) else { return false };
    match NSRunningApplication::runningApplicationWithProcessIdentifier(e.pid) {
        #[allow(deprecated)]
        Some(app) => app.activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows),
        None => false,
    }
}

/// The window's content area, in points: its frame without the title bar when windowed.
fn content(frame: (f64, f64, f64, f64)) -> (f64, f64, f64, f64) {
    let (x, y, w, h) = frame;
    // full screen: the window starts at the top of its screen, no title bar
    if y <= 0.0 { (x, y, w, h) } else { (x, y + TITLE_BAR, w, (h - TITLE_BAR).max(0.0)) }
}

pub fn capture(_id: WindowId) -> Result<Frame, CaptureError> {
    Err(CaptureError::Failed)
}

/// The window's content size, in points (one frame pixel per point).
pub fn client_size(id: WindowId) -> Option<(u32, u32)> {
    let (_, frame) = entry(id)?;
    let (_, _, w, h) = content(frame);
    Some((w as u32, h as u32))
}

/// The mouse in the window's content (frame pixels), when it is over it. Only its position is read.
pub fn cursor_in(id: WindowId, width: u32, height: u32) -> Option<(i32, i32)> {
    let (_, frame) = entry(id)?;
    let (x, y, _, _) = content(frame);
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
    let at = CGEvent::new(source).ok()?.location(); // global, origin at the top left of the main screen
    let (px, py) = ((at.x - x).floor() as i32, (at.y - y).floor() as i32);
    (px >= 0 && py >= 0 && px < width as i32 && py < height as i32).then_some((px, py))
}

/// Vision's text recognition settings (to come).
pub struct OcrEngine;

pub fn ocr_engine() -> Result<OcrEngine, String> {
    Err("macOS OCR not there yet".into())
}

pub fn recognize(_engine: &OcrEngine, _bgra: &[u8], _width: u32, _height: u32) -> Result<Vec<OcrLine>, String> {
    Ok(Vec::new())
}

/// The panel's AppKit window, on the main thread only.
fn with_ns_window(panel: &tauri::WebviewWindow, f: impl FnOnce(&NSWindow) + Send + 'static) {
    let window = panel.clone();
    let _ = panel.run_on_main_thread(move || {
        if let Ok(ptr) = window.ns_window() {
            // SAFETY: Tauri hands the panel's NSWindow, alive as long as the window, on the main thread here
            if let Some(ns) = unsafe { (ptr as *const NSWindow).as_ref() } {
                f(ns);
            }
        }
    });
}

/// The panel floats over every Space and over a full-screen app (Dofus in full screen), at the floating level.
pub fn float_panel(panel: &tauri::WebviewWindow) {
    with_ns_window(panel, |ns| {
        ns.setLevel(NSFloatingWindowLevel);
        ns.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::FullScreenAuxiliary,
        );
        ns.setHidesOnDeactivate(false);
    });
}

/// « open »: shown without activating Dofight (the game keeps the focus); « min » and « hidden »: hidden (the menu-bar
/// icon brings it back).
pub fn show_panel(panel: &tauri::WebviewWindow, mode: &str) -> Result<(), String> {
    let open = mode == "open";
    with_ns_window(panel, move |ns| {
        if open {
            ns.orderFrontRegardless();
        } else {
            ns.orderOut(None);
        }
    });
    Ok(())
}

pub fn panel_shown(panel: &tauri::WebviewWindow) -> bool {
    panel.is_visible().unwrap_or(false)
}

/// At launch: no Dock icon (a menu-bar app), the panel floating, and the menu-bar icon that shows or hides it.
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::image::Image;
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    if let Some(panel) = app.get_webview_window("panel") {
        float_panel(&panel);
    }
    TrayIconBuilder::with_id("dofight")
        .icon(Image::from_bytes(include_bytes!("../../icons/menubar.png"))?)
        .icon_as_template(true)
        .tooltip("Dofight")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                if let Some(panel) = tray.app_handle().get_webview_window("panel") {
                    let mode = if panel_shown(&panel) { "min" } else { "open" };
                    let _ = show_panel(&panel, mode);
                }
            }
        })
        .build(app)?;
    Ok(())
}
