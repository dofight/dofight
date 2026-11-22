//! macOS: tries several ways of preparing a tooltip for the OCR on the squares Songe wrote (DOFIGHT_DUMP).
//!
//! `cargo run --example songe_probe -- <square.bmp>:<cx>,<cy> ...` — the cursor in the square's own pixels, as the
//! `[songe] cursor X,Y square W×H@AX,AY` line of the log gives it (cx = X − AX, cy = Y − AY).
//!
//! It prints, for each tooltip box found, what each preparation reads: this is how the one the app settled on
//! (`smooth_text`: the greys stretched and the picture enlarged smoothly) was measured against the hard threshold
//! and the doubled pixels it replaced (owner, 2026-11-21).
//!
//! The squares it reads are written in the window's points, while on a Retina screen the app's own OCR sees twice
//! as many: a preparation measured here is measured on half the detail the app has (review, 2026-11-22).
//!
//! macOS only; on Windows it is an empty program so that `cargo build --examples` still has a `main` to find.

#[cfg(target_os = "macos")]
mod probe {

    use dofight_lib::platform::{ocr_engine, recognize};
    use dofight_lib::screen::find_tooltips;

    /// The light grey of a tooltip's monster lines (screen.rs TOOLTIP_BOX_TEXT), and of its bold level line (LIGHT).
    const BODY: u8 = 140;

    fn grey(px: &[u8]) -> u32 {
        (px[2] as u32 * 299 + px[1] as u32 * 587 + px[0] as u32 * 114) / 1000
    }

    /// The dump: 24-bit BMP, bottom-up, rows padded to four bytes (screen.rs dump_square) → BGRA, top-down.
    fn read_bmp(path: &str) -> (Vec<u8>, u32, u32) {
        let raw = std::fs::read(path).expect("square");
        let off = u32::from_le_bytes(raw[10..14].try_into().unwrap()) as usize;
        let w = i32::from_le_bytes(raw[18..22].try_into().unwrap()) as usize;
        let h = i32::from_le_bytes(raw[22..26].try_into().unwrap()) as usize;
        let stride = (w * 3 + 3) & !3;
        let mut bgra = vec![255u8; w * h * 4];
        for y in 0..h {
            let row = off + (h - 1 - y) * stride; // bottom-up
            for x in 0..w {
                bgra[(y * w + x) * 4..(y * w + x) * 4 + 3].copy_from_slice(&raw[row + x * 3..row + x * 3 + 3]);
            }
        }
        (bgra, w as u32, h as u32)
    }

    /// A piece of the square, as grey values.
    fn crop(bgra: &[u8], width: u32, (x, y, w, h): (i32, i32, i32, i32)) -> (Vec<u8>, u32, u32) {
        let mut out = Vec::with_capacity((w * h) as usize);
        for cy in y..y + h {
            for cx in x..x + w {
                let o = ((cy as u32 * width + cx as u32) * 4) as usize;
                out.push(grey(&bgra[o..o + 3]) as u8);
            }
        }
        (out, w as u32, h as u32)
    }

    /// Grey to the BGRA the OCR takes.
    fn as_bgra(grey: &[u8]) -> Vec<u8> {
        grey.iter().flat_map(|&g| [g, g, g, 255]).collect()
    }

    /// Every pixel repeated `s` times each way: what the app does today.
    fn blocky(src: &[u8], w: u32, h: u32, s: u32) -> (Vec<u8>, u32, u32) {
        let (ow, oh) = (w * s, h * s);
        let mut out = vec![0u8; (ow * oh) as usize];
        for y in 0..oh {
            for x in 0..ow {
                out[(y * ow + x) as usize] = src[((y / s) * w + (x / s)) as usize];
            }
        }
        (out, ow, oh)
    }

    /// The same size, but each new pixel mixed from the four around it: letters keep their shape instead of growing steps.
    fn smooth(src: &[u8], w: u32, h: u32, s: u32) -> (Vec<u8>, u32, u32) {
        let (ow, oh) = (w * s, h * s);
        let mut out = vec![0u8; (ow * oh) as usize];
        let at = |x: i64, y: i64| src[(y.clamp(0, h as i64 - 1) * w as i64 + x.clamp(0, w as i64 - 1)) as usize] as f32;
        for y in 0..oh {
            for x in 0..ow {
                let (fx, fy) = ((x as f32 + 0.5) / s as f32 - 0.5, (y as f32 + 0.5) / s as f32 - 0.5);
                let (x0, y0) = (fx.floor() as i64, fy.floor() as i64);
                let (tx, ty) = (fx - x0 as f32, fy - y0 as f32);
                let top = at(x0, y0) * (1.0 - tx) + at(x0 + 1, y0) * tx;
                let bottom = at(x0, y0 + 1) * (1.0 - tx) + at(x0 + 1, y0 + 1) * tx;
                out[(y * ow + x) as usize] = (top * (1.0 - ty) + bottom * ty).round() as u8;
            }
        }
        (out, ow, oh)
    }

    /// Black text on white, as the OCR expects it: above the threshold is text.
    fn threshold(src: &[u8], t: u8) -> Vec<u8> {
        src.iter().map(|&g| if g > t { 0 } else { 255 }).collect()
    }

    /// The darkest and the lightest of the piece pulled to black and white, keeping every grey in between.
    fn stretch(src: &[u8]) -> Vec<u8> {
        let (lo, hi) = src.iter().fold((255u8, 0u8), |(lo, hi), &g| (lo.min(g), hi.max(g)));
        if hi <= lo {
            return src.to_vec();
        }
        let span = (hi - lo) as f32;
        // inverted at the same time: the tooltip is light text on a dark box, the OCR wants dark text on a light page
        src.iter().map(|&g| 255 - (((g - lo) as f32 / span) * 255.0).round() as u8).collect()
    }

    pub fn run() {
        let engine = ocr_engine().expect("Vision");
        for arg in std::env::args().skip(1) {
            let (path, cursor) = arg.split_once(':').expect("<square.bmp>:<cx>,<cy>");
            let (cx, cy) = cursor.split_once(',').expect("<cx>,<cy>");
            let (cx, cy) = (cx.parse().expect("cx"), cy.parse().expect("cy"));
            let (bgra, w, h) = read_bmp(path);
            let boxes = find_tooltips(&bgra, w, h, cx, cy);
            println!("\n=== {path} {w}×{h}, cursor {cx},{cy}: {} boxes {boxes:?}", boxes.len());
            for b in boxes {
                let (g, bw, bh) = crop(&bgra, w, b);
                println!("--- box {b:?}");
                let ways: Vec<(&str, Vec<u8>, u32, u32)> = vec![
                    { let (p, pw, ph) = blocky(&threshold(&g, BODY), bw, bh, 2); ("today: threshold, doubled", p, pw, ph) },
                    { let (p, pw, ph) = blocky(&threshold(&g, BODY), bw, bh, 3); ("threshold, tripled", p, pw, ph) },
                    { let (p, pw, ph) = smooth(&threshold(&g, BODY), bw, bh, 2); ("threshold, smoothed ×2", p, pw, ph) },
                    { let (p, pw, ph) = smooth(&stretch(&g), bw, bh, 2); ("greys stretched, smoothed ×2", p, pw, ph) },
                    { let (p, pw, ph) = smooth(&stretch(&g), bw, bh, 3); ("greys stretched, smoothed ×3", p, pw, ph) },
                    { let (p, pw, ph) = smooth(&stretch(&g), bw, bh, 4); ("greys stretched, smoothed ×4", p, pw, ph) },
                ];
                for (name, px, pw, ph) in ways {
                    let started = std::time::Instant::now();
                    let lines = recognize(&engine, &as_bgra(&px), pw, ph).unwrap_or_default();
                    let text: Vec<&str> = lines.iter().map(|l| l.text.as_str()).collect();
                    println!("  {name:30} {:>4} ms  {}", started.elapsed().as_millis(), text.join(" | "));
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn main() {
    probe::run();
}

/// The probe reads a macOS capture with Apple's OCR; on Windows it is an empty program, so that
/// `cargo build --examples` still finds a `main` here (review, 2026-11-22).
#[cfg(not(target_os = "macos"))]
fn main() {}
