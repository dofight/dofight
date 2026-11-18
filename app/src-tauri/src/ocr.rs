//! Windows OCR (Windows.Media.Ocr, fr-FR) on a BGRA image: lines of text with their boxes, in image pixels.

use serde::Serialize;
use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Security::Cryptography::CryptographicBuffer;
use windows::core::HSTRING;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct OcrLine {
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// French OCR engine, or an error when the French recognizer is not installed in Windows.
pub fn engine() -> windows::core::Result<OcrEngine> {
    let lang = Language::CreateLanguage(&HSTRING::from("fr-FR"))?;
    if !OcrEngine::IsLanguageSupported(&lang)? {
        return Err(windows::core::Error::new(
            windows::core::HRESULT(0x80004005u32 as i32),
            "fr-FR OCR missing",
        ));
    }
    OcrEngine::TryCreateFromLanguage(&lang)
}

/// Lines read in a BGRA image (`width * height * 4` bytes).
pub fn recognize(
    engine: &OcrEngine,
    bgra: &[u8],
    width: u32,
    height: u32,
) -> windows::core::Result<Vec<OcrLine>> {
    let buffer = CryptographicBuffer::CreateFromByteArray(bgra)?;
    let bitmap = SoftwareBitmap::CreateCopyFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        width as i32,
        height as i32,
    )?;
    recognize_bitmap(engine, &bitmap)
}

pub fn recognize_bitmap(
    engine: &OcrEngine,
    bitmap: &SoftwareBitmap,
) -> windows::core::Result<Vec<OcrLine>> {
    let result = engine.RecognizeAsync(bitmap)?.join()?;
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
}
