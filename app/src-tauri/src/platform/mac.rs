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
    NSApplicationActivationOptions, NSFloatingWindowLevel, NSPanel, NSRunningApplication, NSWindow,
    NSWindowCollectionBehavior, NSWindowLevel, NSWindowStyleMask, NSWorkspace,
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

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// macOS asks the player once per run at most (the system shows its own dialog the first time).
static ASKED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// How long a capture may take before it counts as failed.
const CAPTURE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

/// How long the list of shareable windows is kept before it is asked for again. Long on purpose: a list too old
/// costs nothing, the game's window is simply not in it and a fresh one is asked for (another account's window, the
/// game restarted).
const CONTENT_TTL: std::time::Duration = std::time::Duration::from_secs(10);

/// The windows ScreenCaptureKit is willing to share, kept for a moment. Asking macOS for them lists every window on
/// the system and costs about 100 ms, measured, while the reader asks for a capture three times a second: it was
/// 40 % of a capture. The list only has to hold the game's window, which does not come and go between two frames;
/// anything else (it closed, another window) falls back to asking again (owner, 2026-11-20).
struct Shareable(objc2::rc::Retained<objc2_screen_capture_kit::SCShareableContent>);
/// SAFETY: a snapshot handed by ScreenCaptureKit and never mutated here; Objective-C objects are retained and read
/// from whichever thread the reader runs on, which is what ARC guarantees.
unsafe impl Send for Shareable {}
static CONTENT: std::sync::Mutex<Option<(std::time::Instant, Shareable)>> = std::sync::Mutex::new(None);

fn cached_content() -> Option<objc2::rc::Retained<objc2_screen_capture_kit::SCShareableContent>> {
    let guard = CONTENT.lock().ok()?;
    let (at, content) = guard.as_ref()?;
    (at.elapsed() < CONTENT_TTL).then(|| content.0.clone())
}

fn remember_content(content: &objc2_screen_capture_kit::SCShareableContent) {
    use objc2::Message as _;
    if let Ok(mut guard) = CONTENT.lock() {
        *guard = Some((std::time::Instant::now(), Shareable(content.retain())));
    }
}

fn forget_content() {
    if let Ok(mut guard) = CONTENT.lock() {
        *guard = None;
    }
}

/// The window's content (without its title bar when windowed), one pixel per point (Retina: halved), in BGRA:
/// ScreenCaptureKit's one-shot capture of that window only (macOS 14), whatever covers it.
pub fn capture(id: WindowId) -> Result<Frame, CaptureError> {
    capture_rect(id, None)
}

/// The window's content, or only its top-left `size` (points).
fn capture_rect(id: WindowId, size: Option<(f64, f64)>) -> Result<Frame, CaptureError> {
    use block2::RcBlock;
    use objc2_foundation::NSError;
    use objc2_screen_capture_kit::SCShareableContent;
    use std::sync::mpsc;

    if !unsafe { CGPreflightScreenCaptureAccess() } {
        if !ASKED.swap(true, std::sync::atomic::Ordering::Relaxed) {
            unsafe { CGRequestScreenCaptureAccess() };
        }
        return Err(CaptureError::Permission);
    }
    let Some((_, frame)) = entry(id) else { return Err(CaptureError::Gone) };
    let (cx, cy, w, h) = content(frame);
    let (w, h) = size.map_or((w, h), |(sw, sh)| (sw.min(w), sh.min(h)));
    if w < 1.0 || h < 1.0 {
        return Err(CaptureError::Minimized);
    }
    let (inner_x, inner_y) = (cx - frame.0, cy - frame.1); // the content inside the window (the title bar above)
    let (tx, rx) = mpsc::channel::<Result<Frame, CaptureError>>();
    let window_id = id as u32;
    let shot = Shot { window_id, inner_x, inner_y, w, h };
    // the list of shareable windows from the last few seconds, when it still has the game's window: asking macOS
    // for a fresh one costs about 100 ms every time (owner, 2026-11-20)
    let mut asked = false;
    if let Some(content) = cached_content() {
        if !shoot(&content, &shot, tx.clone()) {
            forget_content(); // the window is not in it any more: ask again below
        } else {
            asked = true;
        }
    }
    if !asked {
        let handler = RcBlock::new(move |content: *mut SCShareableContent, _error: *mut NSError| {
            // SAFETY: ScreenCaptureKit hands a valid content (or null on error) for the duration of the call
            let Some(content) = (unsafe { content.as_ref() }) else {
                let _ = tx.send(Err(CaptureError::Failed));
                return;
            };
            remember_content(content);
            if !shoot(content, &shot, tx.clone()) {
                let _ = tx.send(Err(CaptureError::Gone));
            }
        });
        unsafe { SCShareableContent::getShareableContentExcludingDesktopWindows_onScreenWindowsOnly_completionHandler(true, true, &handler) };
    }
    rx.recv_timeout(CAPTURE_TIMEOUT).unwrap_or(Err(CaptureError::Failed))
}

/// What one capture asks for: the window and the part of it to take.
#[derive(Clone, Copy)]
struct Shot {
    window_id: u32,
    inner_x: f64,
    inner_y: f64,
    w: f64,
    h: f64,
}

/// Takes the shot from a list of shareable windows, answering on `tx`. False when that list has no such window, and
/// nothing was sent.
fn shoot(
    content: &objc2_screen_capture_kit::SCShareableContent,
    shot: &Shot,
    tx: std::sync::mpsc::Sender<Result<Frame, CaptureError>>,
) -> bool {
    use block2::RcBlock;
    use objc2::AnyThread;
    use objc2_core_foundation::{CGPoint, CGRect as SCRect, CGSize};
    use objc2_core_graphics::CGImage;
    use objc2_foundation::NSError;
    use objc2_screen_capture_kit::{SCContentFilter, SCScreenshotManager, SCStreamConfiguration};

    let windows = unsafe { content.windows() };
    let Some(window) = windows.iter().find(|win| unsafe { win.windowID() } == shot.window_id) else {
        return false;
    };
    let filter = unsafe { SCContentFilter::initWithDesktopIndependentWindow(SCContentFilter::alloc(), &window) };
    let config = unsafe { SCStreamConfiguration::new() };
    unsafe {
        config.setSourceRect(SCRect { origin: CGPoint { x: shot.inner_x, y: shot.inner_y }, size: CGSize { width: shot.w, height: shot.h } });
        config.setWidth(shot.w as usize);
        config.setHeight(shot.h as usize);
        config.setShowsCursor(false);
        config.setPixelFormat(0x4247_5241); // 'BGRA'
        // sRGB, not the screen's own space: the pixels are compared to numbers measured on Windows (the tooltip
        // colours Songe looks for), and a wide-gamut screen gives the same colour other numbers (owner, 2026-11-20)
        config.setColorSpaceName(objc2_core_graphics::kCGColorSpaceSRGB);
    }
    let done = RcBlock::new(move |image: *mut CGImage, _error: *mut NSError| {
        let _ = tx.send(unsafe { image.as_ref() }.map(bgra_of).unwrap_or(Err(CaptureError::Failed)));
    });
    unsafe { SCScreenshotManager::captureImageWithFilter_configuration_completionHandler(&filter, &config, Some(&done)) };
    true
}

/// The window's top-left piece only (`width` × `height` in its content's points): ScreenCaptureKit captures just that
/// rectangle (owner, 2026-11-20: Dofight never receives the rest of the game for the header).
pub fn capture_top_left(id: WindowId, width: u32, height: u32) -> Result<Frame, CaptureError> {
    capture_rect(id, Some((width as f64, height as f64)))
}

/// A captured image's pixels as tight BGRA rows.
fn bgra_of(image: &objc2_core_graphics::CGImage) -> Result<Frame, CaptureError> {
    use objc2_core_graphics::{CGDataProvider, CGImage};
    let (w, h) = (CGImage::width(Some(image)), CGImage::height(Some(image)));
    let row = CGImage::bytes_per_row(Some(image));
    let provider = CGImage::data_provider(Some(image)).ok_or(CaptureError::Failed)?;
    let data = CGDataProvider::data(Some(&provider)).ok_or(CaptureError::Failed)?;
    let bytes = unsafe { data.as_bytes_unchecked() };
    if w == 0 || h == 0 || row < w * 4 || bytes.len() < row * h {
        return Err(CaptureError::Failed);
    }
    let mut out = Vec::with_capacity(w * h * 4);
    for y in 0..h {
        out.extend_from_slice(&bytes[y * row..y * row + w * 4]);
    }
    Ok((out, w as u32, h as u32))
}

/// Where the content's top left is on screen (points, origin at the top left of the main screen).
pub fn client_origin(id: WindowId) -> Option<(i32, i32)> {
    let (_, frame) = entry(id)?;
    let (x, y, _, _) = content(frame);
    Some((x as i32, y as i32))
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

/// Vision's text recognition (accurate, French then English, no language correction: place names). Vision's objects
/// are made for each reading, so the engine holds no state.
pub struct OcrEngine;

pub fn ocr_engine() -> Result<OcrEngine, String> {
    Ok(OcrEngine)
}

/// Lines read in a BGRA image (`width * height * 4` bytes), in image pixels.
pub fn recognize(_engine: &OcrEngine, bgra: &[u8], width: u32, height: u32) -> Result<Vec<OcrLine>, String> {
    use super::vision_box_to_frame;
    use core_graphics::base::{kCGBitmapByteOrder32Little, kCGImageAlphaPremultipliedFirst, kCGRenderingIntentDefault};
    use core_graphics::color_space::CGColorSpace;
    use core_graphics::data_provider::CGDataProvider;
    use core_graphics::image::CGImage as CgImage;
    use objc2::AnyThread;
    use objc2_foundation::{NSArray, NSDictionary, NSString};
    use objc2_vision::{VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel};

    if width == 0 || height == 0 || bgra.len() < (width * height * 4) as usize {
        return Ok(Vec::new());
    }
    let image = CgImage::new(
        width as usize,
        height as usize,
        8,
        32,
        width as usize * 4,
        &CGColorSpace::create_device_rgb(),
        kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst,
        &CGDataProvider::from_buffer(std::sync::Arc::new(bgra.to_vec())),
        false,
        kCGRenderingIntentDefault,
    );
    // SAFETY: the same CoreGraphics image, seen through objc2's binding
    let cg = unsafe { &*(foreign_types::ForeignType::as_ptr(&image) as *const objc2_core_graphics::CGImage) };
    let request = VNRecognizeTextRequest::new();
    request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
    request.setRecognitionLanguages(&NSArray::from_retained_slice(&[NSString::from_str("fr-FR"), NSString::from_str("en-US")]));
    request.setUsesLanguageCorrection(false);
    let handler = unsafe { VNImageRequestHandler::initWithCGImage_options(VNImageRequestHandler::alloc(), cg, &NSDictionary::new()) };
    let requests: [&VNRequest; 1] = [&request];
    handler.performRequests_error(&NSArray::from_slice(&requests)).map_err(|e| e.localizedDescription().to_string())?;
    let mut out = Vec::new();
    for observation in request.results().into_iter().flatten() {
        let Some(best) = observation.topCandidates(1).firstObject() else { continue };
        let b = unsafe { observation.boundingBox() };
        let (x, y, w, h) = vision_box_to_frame((b.origin.x, b.origin.y, b.size.width, b.size.height), width, height);
        out.push(OcrLine { text: best.string().to_string(), x, y, w, h });
    }
    Ok(out)
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

/// NSStatusWindowLevel: over a full-screen game, under the system's own menus.
const OVERLAY_LEVEL: NSWindowLevel = 25;

/// The class each converted window had, by label. Turning a window into a panel swaps its Objective-C class, and the
/// exit path (tao, the plugins) expects the one it made: left swapped, closing Dofight raises an Objective-C
/// exception, which Rust cannot catch and which aborts the process (owner, 2026-11-20).
static CONVERTED: std::sync::Mutex<Vec<(String, usize)>> = std::sync::Mutex::new(Vec::new());

#[link(name = "objc")]
unsafe extern "C" {
    fn object_getClass(object: *const std::ffi::c_void) -> *const std::ffi::c_void;
    fn object_setClass(object: *const std::ffi::c_void, class: *const std::ffi::c_void) -> *const std::ffi::c_void;
}

/// Gives one converted window its class back, before it is torn down. A detached sheet closes on its own, long
/// before Dofight exits, and took the whole app down with it while it was still a panel (owner, 2026-11-20).
fn restore_panel(window: &tauri::WebviewWindow) {
    let class = {
        let mut converted = CONVERTED.lock().unwrap();
        let Some(i) = converted.iter().position(|(label, _)| label == window.label()) else { return };
        converted.swap_remove(i).1
    };
    let Ok(ptr) = window.ns_window() else { return };
    // SAFETY: the window is still alive here, and `class` is the one this very instance was made with
    unsafe {
        if let Some(ns) = (ptr as *const NSPanel).as_ref() {
            ns.setStyleMask(ns.styleMask() & !NSWindowStyleMask::NonactivatingPanel);
        }
        object_setClass(ptr as *const std::ffi::c_void, class as *const std::ffi::c_void);
    }
}

/// The same for whatever is left, as Dofight exits.
pub fn restore_panels(app: &tauri::AppHandle) {
    let labels: Vec<String> = CONVERTED.lock().unwrap().iter().map(|(label, _)| label.clone()).collect();
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            restore_panel(&window);
        }
    }
}

/// The panel floats over every Space and over a full-screen app (Dofus in full screen), and answers the pointer
/// without ever activating Dofight.
///
/// It becomes a non-activating `NSPanel` first. macOS sends no mouse event at all to a plain `NSWindow` of an app
/// that is not the active one, so nothing was hovered until Dofight had been clicked, and that click took the focus
/// from the game; the sheets' own buttons (the ✕, « Guide ») never answered either. A non-activating panel takes the
/// pointer and leaves the game active (owner, 2026-11-20).
pub fn float_panel(panel: &tauri::WebviewWindow) {
    use tauri_nspanel::WebviewWindowExt;
    let window = panel.clone();
    let _ = panel.run_on_main_thread(move || {
        let Ok(ptr) = window.ns_window() else { return };
        // SAFETY: reading the class of a live Objective-C object on the main thread
        let was = unsafe { object_getClass(ptr as *const std::ffi::c_void) } as usize;
        // a plain window if it cannot be converted: the overlay still shows, only the panel behaviour is missing
        let panel = match window.to_panel() {
            Ok(_) => true,
            Err(e) => {
                eprintln!("[overlay] {} stays a plain window: {e:?}", window.label());
                false
            }
        };
        // SAFETY: Tauri hands the window's own NSWindow, alive as long as the window, on the main thread here;
        // `to_panel` swaps the class of that same instance, so the pointer stays good either way
        let Some(ns) = (unsafe { (ptr as *const NSWindow).as_ref() }) else { return };
        ns.setLevel(if panel { OVERLAY_LEVEL } else { NSFloatingWindowLevel });
        ns.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::FullScreenAuxiliary,
        );
        // an NSPanel hides itself whenever its app stops being the active one, which is all the time here
        ns.setHidesOnDeactivate(false);
        if panel {
            // SAFETY: the instance is an NSPanel, `to_panel` having succeeded
            let ns = unsafe { &*(ptr as *const NSPanel) };
            ns.setStyleMask(ns.styleMask() | NSWindowStyleMask::NonactivatingPanel);
            // the keyboard only when something really asks for it (the search field): with this off, a plain click on
            // the panel made it the key window and took Dofus out of focus (owner, 2026-11-20). Clicks still reach
            // the page without it, the windows having « acceptFirstMouse ».
            ns.setBecomesKeyOnlyIfNeeded(true);
            // mouse-moved events are not sent to a window that does not ask for them (hover)
            ns.setAcceptsMouseMovedEvents(true);
            CONVERTED.lock().unwrap().push((window.label().to_string(), was));
            let closing = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    restore_panel(&closing);
                }
            });
        }
    });
}

/// A side window made at run time (a detached sheet's replacement): it floats as the panel does, but it is NOT turned
/// into a panel. `to_panel` over-releases on a window built at run time and the process dies with a segmentation
/// fault inside `objc_release` (dragging a sheet away, owner 2026-11-20). The windows made at launch convert fine, so
/// the first sheet keeps the panel behaviour; a replacement is a plain floating window until the crate is sorted out.
pub fn float_side(side: &tauri::WebviewWindow) {
    with_ns_window(side, |ns| {
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

/// A sheet the player dragged away is their own window from then on: a click on it may make it the key window, so
/// Escape closes it. The others never take the keyboard, so the game keeps it (owner, 2026-11-20).
pub fn detached_side(side: &tauri::WebviewWindow) {
    let window = side.clone();
    let _ = side.run_on_main_thread(move || {
        let Ok(ptr) = window.ns_window() else { return };
        // only a converted window answers the NSPanel-only selectors: a side window made at run time is a plain
        // NSWindow (float_side), and sending it one of them aborts the process from inside Objective-C
        let converted = CONVERTED.lock().unwrap().iter().any(|(label, _)| label == window.label());
        // SAFETY: the window is alive, on the main thread, and an NSPanel only when it was converted
        let Some(ns) = (unsafe { (ptr as *const NSPanel).as_ref() }) else { return };
        if converted {
            ns.setBecomesKeyOnlyIfNeeded(false);
        }
        ns.makeKeyWindow(); // NSWindow's own: safe either way
    });
}

/// Shows a side window (a sheet, a preview) without making it the key window. Tauri's own `show()` does
/// `makeKeyAndOrderFront`, and macOS then sends what the pointer does to that sheet instead of the panel: hovering
/// another row did nothing at all until the pointer had left Dofight (owner, 2026-11-20).
pub fn show_side(side: &tauri::WebviewWindow) {
    with_ns_window(side, |ns| ns.orderFrontRegardless());
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
    // the side windows float, but are NOT turned into panels (float_side). Only the panel is, and it is made once
    // and never closed: converting a window that opens and closes again and again crashed Dofight from inside AppKit
    // (closing a sheet, and `to_panel` on a window made at run time). They keep everything else: clicks through
    // « acceptFirstMouse », the pointer followed by the panel, and `orderFrontRegardless` so they never take the
    // focus. What they lose is being drawn over a full-screen Dofus (owner, 2026-11-20).
    if let Some(side) = app.get_webview_window("peek") {
        float_side(&side);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_of_an_unknown_window_never_panics() {
        // no window 0: gone, or refused on a machine where Dofight may not record the screen
        assert!(matches!(capture(0), Err(CaptureError::Gone | CaptureError::Permission | CaptureError::Failed)));
    }

    #[test]
    fn a_blank_image_reads_nothing() {
        let white = vec![255u8; 200 * 50 * 4];
        assert_eq!(recognize(&OcrEngine, &white, 200, 50).unwrap(), vec![]);
    }
}
