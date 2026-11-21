//! Windows: Win32 window list and capture (PrintWindow, else the screen pixels), Windows OCR (Windows.Media.Ocr,
//! fr-FR), the panel shown without being activated. Moved as is from screen.rs, ocr.rs and lib.rs.

use super::{CaptureError, DofusWindow, Frame, WindowId};
use crate::ocr::OcrLine;
use crate::screen::is_blank;
use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine as WinOcrEngine;
use windows::Security::Cryptography::CryptographicBuffer;
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, ClientToScreen, CreateCompatibleBitmap,
    CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC, GetDIBits, ReleaseDC,
    SRCCOPY, ScreenToClient, SelectObject,
};
use windows::Win32::Storage::Xps::{PRINT_WINDOW_FLAGS, PrintWindow};
use windows::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    QueryFullProcessImageNameW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClientRect, GetCursorPos, GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, SW_HIDE, SW_SHOWMINNOACTIVE, SW_SHOWNOACTIVATE,
};
use windows::core::{BOOL, HSTRING, PWSTR};

const PW_RENDERFULLCONTENT: u32 = 2;

fn hwnd(id: WindowId) -> HWND {
    HWND(id as *mut _)
}

fn process_name(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        path.rsplit('\\').next().map(|s| s.to_lowercase())
    }
}

fn window_title(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetWindowTextW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

fn window_pid(hwnd: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    pid
}

/// Visible top-level windows of Dofus.exe, in z-order.
pub fn dofus_windows() -> Vec<DofusWindow> {
    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let list = unsafe { &mut *(lparam.0 as *mut Vec<DofusWindow>) };
        if unsafe { IsWindowVisible(hwnd) }.as_bool() {
            let title = window_title(hwnd);
            if !title.is_empty() && process_name(window_pid(hwnd)).as_deref() == Some("dofus.exe") {
                list.push(DofusWindow {
                    id: hwnd.0 as isize,
                    title,
                });
            }
        }
        BOOL(1)
    }
    let mut list: Vec<DofusWindow> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut list as *mut _ as isize));
    }
    list
}

/// The window in front (the foreground window).
pub fn front_window() -> Option<WindowId> {
    let front = unsafe { GetForegroundWindow() };
    (!front.0.is_null()).then_some(front.0 as isize)
}

/// Dofight's own window is in front (the player is using the panel).
pub fn front_is_ours() -> bool {
    window_pid(unsafe { GetForegroundWindow() }) == unsafe { GetCurrentProcessId() }
}

/// Brings the window in front: a window activation only, nothing is sent to the game (allowed by Windows: Dofight
/// is in front, the player just clicked it).
pub fn focus(id: WindowId) -> bool {
    unsafe { SetForegroundWindow(hwnd(id)).as_bool() }
}

/// The window's content: its own drawing first (works while Dofight's windows cover it), else the screen pixels of
/// its client area (the window is in front when this runs).
pub fn capture(id: WindowId) -> Result<Frame, CaptureError> {
    let hwnd = hwnd(id);
    if unsafe { IsIconic(hwnd) }.as_bool() {
        return Err(CaptureError::Minimized);
    }
    match capture_window(hwnd, false) {
        Some(frame) if !is_blank(&frame.0) => Ok(frame),
        _ => capture_window(hwnd, true).ok_or(CaptureError::Failed),
    }
}

fn capture_window(hwnd: HWND, from_screen: bool) -> Option<Frame> {
    unsafe {
        let mut rect = RECT::default();
        GetClientRect(hwnd, &mut rect).ok()?;
        let (w, h) = (
            (rect.right - rect.left) as i32,
            (rect.bottom - rect.top) as i32,
        );
        if w <= 0 || h <= 0 {
            return None;
        }
        let screen = GetDC(None);
        let dc = CreateCompatibleDC(Some(screen));
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(dc, bmp.into());
        let ok = if from_screen {
            let mut origin = POINT { x: 0, y: 0 };
            let _ = ClientToScreen(hwnd, &mut origin);
            BitBlt(dc, 0, 0, w, h, Some(screen), origin.x, origin.y, SRCCOPY).is_ok()
        } else {
            PrintWindow(hwnd, dc, PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT | 1)).as_bool() // 1 = client only
        };
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (w * h * 4) as usize];
        let rows = GetDIBits(
            dc,
            bmp,
            0,
            h as u32,
            Some(pixels.as_mut_ptr().cast()),
            &mut info,
            DIB_RGB_COLORS,
        );
        SelectObject(dc, old);
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(dc);
        ReleaseDC(None, screen);
        (ok && rows == h).then_some((pixels, w as u32, h as u32))
    }
}

/// Where the client area's top left is on screen (physical pixels): the debug window draws there.
pub fn client_origin(id: WindowId) -> Option<(i32, i32)> {
    let mut origin = POINT { x: 0, y: 0 };
    unsafe { ClientToScreen(hwnd(id), &mut origin) }.as_bool().then_some((origin.x, origin.y))
}

/// The window's top-left piece only (`width` × `height` client pixels): the game draws into an image that size, so
/// Dofight never receives the rest of the window (owner, 2026-11-20; measured identical to that piece of a whole
/// capture). Its own drawing first (works while a window covers it), else the screen pixels of that piece. Only the
/// top left: Dofus ignores a shifted drawing origin, so a piece elsewhere cannot be captured this way.
pub fn capture_top_left(id: WindowId, width: u32, height: u32) -> Result<Frame, CaptureError> {
    let hwnd = hwnd(id);
    if unsafe { IsIconic(hwnd) }.as_bool() {
        return Err(CaptureError::Minimized);
    }
    let (cw, ch) = client_size(id).ok_or(CaptureError::Gone)?;
    let (w, h) = (width.min(cw) as i32, height.min(ch) as i32);
    if w <= 0 || h <= 0 {
        return Err(CaptureError::Failed);
    }
    match capture_piece(hwnd, w, h, false) {
        Some(frame) if !is_blank(&frame.0) => Ok(frame),
        _ => capture_piece(hwnd, w, h, true).ok_or(CaptureError::Failed),
    }
}

fn capture_piece(hwnd: HWND, w: i32, h: i32, from_screen: bool) -> Option<Frame> {
    unsafe {
        let screen = GetDC(None);
        let dc = CreateCompatibleDC(Some(screen));
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(dc, bmp.into());
        let ok = if from_screen {
            let mut origin = POINT { x: 0, y: 0 };
            let _ = ClientToScreen(hwnd, &mut origin);
            BitBlt(dc, 0, 0, w, h, Some(screen), origin.x, origin.y, SRCCOPY).is_ok()
        } else {
            PrintWindow(hwnd, dc, PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT | 1)).as_bool() // 1 = client only
        };
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (w * h * 4) as usize];
        let rows = GetDIBits(dc, bmp, 0, h as u32, Some(pixels.as_mut_ptr().cast()), &mut info, DIB_RGB_COLORS);
        SelectObject(dc, old);
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(dc);
        ReleaseDC(None, screen);
        (ok && rows == h).then_some((pixels, w as u32, h as u32))
    }
}

/// The window's client area size, in frame pixels.
pub fn client_size(id: WindowId) -> Option<(u32, u32)> {
    let mut rect = RECT::default();
    unsafe { GetClientRect(hwnd(id), &mut rect).ok()? };
    Some(((rect.right - rect.left) as u32, (rect.bottom - rect.top) as u32))
}

/// The mouse in the window's client area (frame pixels), when it is over it. Only its position is read.
pub fn cursor_in(id: WindowId, width: u32, height: u32) -> Option<(i32, i32)> {
    let mut p = POINT::default();
    unsafe {
        GetCursorPos(&mut p).ok()?;
        if !ScreenToClient(hwnd(id), &mut p).as_bool() {
            return None;
        }
    }
    (p.x >= 0 && p.y >= 0 && p.x < width as i32 && p.y < height as i32).then_some((p.x, p.y))
}

/// The French OCR engine of Windows.
pub struct OcrEngine(WinOcrEngine);

/// French OCR engine, or an error when the French recognizer is not installed in Windows.
pub fn ocr_engine() -> Result<OcrEngine, String> {
    let make = || -> windows::core::Result<WinOcrEngine> {
        let lang = Language::CreateLanguage(&HSTRING::from("fr-FR"))?;
        if !WinOcrEngine::IsLanguageSupported(&lang)? {
            return Err(windows::core::Error::new(
                windows::core::HRESULT(0x80004005u32 as i32),
                "fr-FR OCR missing",
            ));
        }
        WinOcrEngine::TryCreateFromLanguage(&lang)
    };
    make().map(OcrEngine).map_err(|e| e.message().to_string())
}

/// Lines read in a BGRA image (`width * height * 4` bytes), in image pixels.
pub fn recognize(engine: &OcrEngine, bgra: &[u8], width: u32, height: u32) -> Result<Vec<OcrLine>, String> {
    let read = || -> windows::core::Result<Vec<OcrLine>> {
        let buffer = CryptographicBuffer::CreateFromByteArray(bgra)?;
        let bitmap = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, width as i32, height as i32)?;
        let result = engine.0.RecognizeAsync(&bitmap)?.join()?;
        let mut out = Vec::new();
        for line in result.Lines()? {
            let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
            for word in line.Words()? {
                let r = word.BoundingRect()?;
                x0 = x0.min(r.X);
                y0 = y0.min(r.Y);
                x1 = x1.max(r.X + r.Width);
                y1 = y1.max(r.Y + r.Height);
            }
            out.push(OcrLine {
                text: line.Text()?.to_string(),
                x: x0 as i32,
                y: y0 as i32,
                w: (x1 - x0) as i32,
                h: (y1 - y0) as i32,
            });
        }
        Ok(out)
    };
    read().map_err(|e| e.message().to_string())
}

/// The overlay panel, never activated (the game keeps the focus): "open" restores it, "min" leaves only its
/// taskbar button, "hidden" removes it from the taskbar too.
pub fn show_panel(panel: &tauri::WebviewWindow, mode: &str) -> Result<(), String> {
    let hwnd = panel.hwnd().map_err(|e| e.to_string())?;
    let cmd = match mode {
        "open" => SW_SHOWNOACTIVATE,
        "min" => SW_SHOWMINNOACTIVE,
        _ => SW_HIDE,
    };
    unsafe {
        let _ = ShowWindow(HWND(hwnd.0 as _), cmd);
    }
    Ok(())
}

/// Whether the panel is on screen (the page asks `isMinimized` itself on Windows: kept for the same command).
pub fn panel_shown(panel: &tauri::WebviewWindow) -> bool {
    panel.is_visible().unwrap_or(false) && !panel.is_minimized().unwrap_or(false)
}

/// Nothing to set up on Windows (the panel's taskbar button is the panel's own).
pub fn setup(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

/// A side window made at run time (a detached sheet's replacement): its config's always-on-top is enough here.
pub fn float_side(_side: &tauri::WebviewWindow) {}

/// macOS only (the panels' classes): nothing to put back here.
pub fn restore_panels(_app: &tauri::AppHandle) {}

/// macOS only: a Windows window already takes the keyboard once it is focusable.
pub fn detached_side(_side: &tauri::WebviewWindow) {}

/// Windows shows a side window as it always did: a window here never takes the focus on its own.
pub fn show_side(side: &tauri::WebviewWindow) {
    let _ = side.show();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Live check, only on request (`cargo test --lib top_left -- --ignored --nocapture`) with Dofus open: the
    /// top-left piece captured alone has the same pixels as that piece of the whole window (nothing is sent to the game).
    #[test]
    #[ignore]
    fn the_top_left_piece_matches_the_whole_window() {
        let window = dofus_windows().into_iter().next().expect("Dofus open");
        let (full, fw, fh) = capture(window.id).expect("whole window");
        let (cw, ch) = crate::screen::corner_size(fw, fh);
        let (px, w, h) = capture_top_left(window.id, cw, ch).expect("piece");
        let (mut same, mut total) = (0usize, 0usize);
        for y in 0..h as usize {
            for x in 0..w as usize {
                let a = &px[(y * w as usize + x) * 4..][..3];
                let b = &full[(y * fw as usize + x) * 4..][..3];
                total += 1;
                same += usize::from(a.iter().zip(b).all(|(p, q)| p.abs_diff(*q) <= 8));
            }
        }
        println!("top left {w}x{h}: {:.1} % of its pixels as in the whole window", 100.0 * same as f64 / total as f64);
        assert!(same * 100 >= total * 95);
    }
}
