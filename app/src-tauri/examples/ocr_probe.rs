//! cargo run --example ocr_probe -- <image.png>...   prints the OCR lines of each image as JSON
fn main() -> windows::core::Result<()> {
    let engine = dofight_lib::ocr::engine()?;
    for path in std::env::args().skip(1) {
        let img = image::open(&path).expect("image").to_rgba8();
        let (w, h) = img.dimensions();
        let mut bgra = img.into_raw();
        for px in bgra.chunks_exact_mut(4) {
            px.swap(0, 2);
        }
        let started = std::time::Instant::now();
        let lines = dofight_lib::ocr::recognize(&engine, &bgra, w, h)?;
        let ms = started.elapsed().as_millis();
        println!(
            "{}",
            serde_json::json!({ "image": path, "ms": ms, "lines": lines })
        );
    }
    Ok(())
}
