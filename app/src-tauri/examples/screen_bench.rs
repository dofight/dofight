//! cargo run --release --example screen_bench -- <list.txt> <out.jsonl>
//! Runs the overlay's screen reading (light text + Windows OCR) on saved game frames, one JSON line per frame.
use std::io::Write;

fn main() -> windows::core::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let list = std::fs::read_to_string(&args[1]).expect("list");
    let mut out = std::fs::File::create(&args[2]).expect("out");
    let engine = dofight_lib::ocr::engine()?;
    for path in list.lines().filter(|l| !l.trim().is_empty()) {
        let Ok(img) = image::open(path.trim()) else {
            continue;
        };
        let img = img.to_rgba8();
        let (w, h) = img.dimensions();
        let mut px = img.into_raw();
        px.chunks_exact_mut(4).for_each(|p| p.swap(0, 2));
        let started = std::time::Instant::now();
        let mut lines = dofight_lib::screen::read_frame(&engine, &px, w, h)?;
        // what « Songe » mode adds: the monster lines under each group tooltip header
        let tooltips = dofight_lib::screen::read_tooltips(&engine, &px, w, h, &lines)?;
        lines.extend(tooltips);
        let ms = started.elapsed().as_millis();
        // « Songe » mode reads around the resting mouse: pretend it rests on the group, just under each tooltip
        let hovered: Vec<_> = lines
            .iter()
            .filter(|l| dofight_lib::screen::is_group_header(&l.text))
            .map(|l| {
                let (cx, cy) = (l.x + l.w / 2, l.y + 230);
                let started = std::time::Instant::now();
                let found = dofight_lib::screen::read_hovered(&engine, &px, w, h, cx, cy).unwrap_or_default();
                serde_json::json!({ "header": l.text, "ms": started.elapsed().as_millis(), "lines": found.len() })
            })
            .collect();
        writeln!(
            out,
            "{}",
            serde_json::json!({ "image": path.trim(), "w": w, "h": h, "ms": ms, "lines": lines, "hovered": hovered })
        )
        .unwrap();
    }
    Ok(())
}
