//! macOS: Dofight is a menu-bar app (no Dock icon); its panel floats over every Space, full-screen Dofus included,
//! without taking the focus from the game. The reading (window list, ScreenCaptureKit capture, Vision OCR) comes in
//! the next steps: until then the reader says the OCR is missing.

use super::{CaptureError, DofusWindow, Frame, WindowId};
use crate::ocr::OcrLine;
use objc2_app_kit::{NSFloatingWindowLevel, NSWindow, NSWindowCollectionBehavior};
use tauri::Manager;

pub fn dofus_windows() -> Vec<DofusWindow> {
    Vec::new()
}

pub fn front_window() -> Option<WindowId> {
    None
}

pub fn front_is_ours() -> bool {
    false
}

pub fn focus(_id: WindowId) -> bool {
    false
}

pub fn capture(_id: WindowId) -> Result<Frame, CaptureError> {
    Err(CaptureError::Failed)
}

pub fn client_size(_id: WindowId) -> Option<(u32, u32)> {
    None
}

pub fn cursor_in(_id: WindowId, _width: u32, _height: u32) -> Option<(i32, i32)> {
    None
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
