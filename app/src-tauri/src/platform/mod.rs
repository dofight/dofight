//! Every call that touches the operating system, behind one set of functions: `win.rs` on Windows (Win32 capture,
//! Windows OCR), `mac.rs` on macOS (CoreGraphics, ScreenCaptureKit, Vision, AppKit). The reading logic (screen.rs,
//! iconbar.rs) only uses these, so it is the same on both. Nothing here ever sends anything to the game.

use serde::Serialize;

#[cfg(target_os = "macos")]
mod mac;
mod shared;
#[cfg(windows)]
mod win;

#[cfg(target_os = "macos")]
pub use mac::*;
#[cfg(windows)]
pub use win::*;
#[allow(unused_imports)] // used by the macOS half; tested on every system
pub use shared::*;

/// A game window: an `HWND` on Windows, a CGWindowID on macOS.
pub type WindowId = isize;

/// A captured window's content: BGRA pixels, width, height (one pixel per point on a Retina Mac).
pub type Frame = (Vec<u8>, u32, u32);

/// A visible Dofus window (its title starts with the character's name).
#[derive(Debug, Clone, Serialize)]
pub struct DofusWindow {
    pub id: WindowId,
    pub title: String,
}

/// Why a window could not be captured.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureError {
    /// The window is no longer there.
    Gone,
    /// Minimised (nothing to read).
    Minimized,
    /// macOS: « Enregistrement de l'écran » not granted to Dofight (never on Windows).
    Permission,
    Failed,
}
