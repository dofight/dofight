//! A line of text read in an image (by the platform's OCR: Windows OCR, or Vision on macOS), its box in image pixels.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct OcrLine {
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}
