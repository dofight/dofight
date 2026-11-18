fn main() {
    // the Discord webhook for « Suggérer » is baked in at build time (CI secret); absent = sending disabled
    println!("cargo:rerun-if-env-changed=DOFIGHT_WEBHOOK");
    tauri_build::build()
}
