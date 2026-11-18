#[cfg(windows)]
pub mod diag;
pub mod iconbar;
mod iconbar_refs;
pub mod ocr;
pub mod report;
#[cfg(windows)]
pub mod screen;
pub mod selfupdate;

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_window_state::StateFlags;

/// The player's shortcut (default Ctrl+Shift+D) shows or hides the overlay from anywhere. Dofight only listens to
/// it: nothing is sent to the game. The front end sets it at launch and whenever the player changes it.
#[tauri::command]
fn set_shortcut(app: tauri::AppHandle, keys: String) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all().map_err(|e| e.to_string())?;
    if keys.trim().is_empty() {
        return Ok(());
    }
    shortcuts.register(keys.as_str()).map_err(|e| e.to_string())
}

/// "Fermer Dofight": closes every window, icon included.
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

/// Open Dofus windows (title = character name first), for the « Fenêtre Dofus de référence » setting.
#[tauri::command]
fn list_dofus_windows() -> Vec<String> {
    screen::dofus_windows()
        .into_iter()
        .map(|w| w.title)
        .collect()
}

/// « Songe » turned on from Dofight: the reference Dofus window comes back in front so its tooltips show on hover.
#[tauri::command]
fn focus_dofus(reference: tauri::State<screen::Reference>) -> bool {
    let prefix = reference.0.lock().map(|p| p.clone()).unwrap_or_default();
    let done = screen::focus_reference(&prefix);
    diag::log("songe", if done { "Dofus brought back in front" } else { "Dofus could not be brought in front" });
    done
}

/// The reference window: the first Dofus window whose title starts with `prefix` (empty = the first one found).
#[tauri::command]
fn set_reference(prefix: String, reference: tauri::State<screen::Reference>) {
    if let Ok(mut p) = reference.0.lock() {
        *p = prefix;
    }
}

/// « Suggérer »: sends a report built by the front end (see report.rs for the error codes).
#[tauri::command]
async fn send_report(
    body: serde_json::Value,
    attach_log: bool,
    last: tauri::State<'_, report::LastSent>,
) -> Result<(), String> {
    let log = attach_log.then(|| diag::recent(LOG_MINUTES));
    report::send(body, log, &last).await
}

/// How far back the log sent with a suggestion (or copied) goes.
const LOG_MINUTES: u64 = 10;

/// A line of the diagnostic log from the page (already cleaned: never raw screen text or window titles).
#[tauri::command]
fn log_event(area: String, message: String) {
    diag::log(&area, &message);
}

/// The recent diagnostic log, for « Copier le diagnostic ».
#[tauri::command]
fn diagnostic_text() -> String {
    diag::recent(LOG_MINUTES)
}

/// Opens the logs folder in the Explorer.
#[tauri::command]
fn open_log_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = diag::dir().ok_or("no-log")?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// The overlay panel, never activated (the game keeps the focus): "open" restores it, "min" leaves only its
/// taskbar button (the shortcut, the auto close and « Masquer Dofight hors de Dofus » all use it), "hidden" removes it
/// from the taskbar too (not used by the page today: the taskbar button always stays).
#[tauri::command]
fn panel_show(app: tauri::AppHandle, mode: String) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        ShowWindow, SW_HIDE, SW_SHOWMINNOACTIVE, SW_SHOWNOACTIVATE,
    };
    let panel = app.get_webview_window("panel").ok_or("no panel")?;
    let hwnd = panel.hwnd().map_err(|e| e.to_string())?;
    let cmd = match mode.as_str() {
        "open" => SW_SHOWNOACTIVATE,
        "min" => SW_SHOWMINNOACTIVE,
        _ => SW_HIDE,
    };
    unsafe {
        let _ = ShowWindow(HWND(hwnd.0 as _), cmd);
    }
    Ok(())
}

/// « Songe » mode on or off (the toggle next to the search bar).
#[tauri::command]
fn set_songe(on: bool, songe: tauri::State<screen::Songe>) {
    songe.0.store(on, std::sync::atomic::Ordering::Relaxed);
    if !on {
        // Songe off: one reading at once, so the zone comes back even in a fight
        songe.1.store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

/// One more reading at once: the zone header just read was cut or not recognised (an animated map, the world map
/// hovered), so the reader does not wait for the next change to try again.
#[tauri::command]
fn read_again(songe: tauri::State<screen::Songe>) {
    songe.1.store(true, std::sync::atomic::Ordering::Relaxed);
}

/// « Lecture de l'écran » on or off (the settings): off, the Dofus window is not captured at all.
#[tauri::command]
fn set_reading(on: bool, reading: tauri::State<screen::Reading>) {
    reading.0.store(on, std::sync::atomic::Ordering::Relaxed);
}

/// The overlay's view of the fight: in a fight the screen is read less often and « Songe » sleeps.
#[tauri::command]
fn set_in_fight(on: bool, in_fight: tauri::State<screen::InFight>) {
    in_fight.0.store(on, std::sync::atomic::Ordering::Relaxed);
}

/// This exe's path, read at launch (before an update renames the running file).
struct Exe(std::path::PathBuf);

/// The update found by `portable_check`, downloaded by `portable_install`.
#[derive(Default)]
struct PendingUpdate(std::sync::Mutex<Option<tauri_plugin_updater::Update>>);

/// « installer » for the installed Dofight (it updates through the signed installer), « portable » for a copy run
/// from anywhere else, which replaces its own exe (see selfupdate.rs).
#[tauri::command]
fn update_kind(exe: tauri::State<Exe>) -> &'static str {
    if selfupdate::is_installed(&exe.0) {
        "installer"
    } else {
        "portable"
    }
}

/// A newer release's version for a portable copy, or None. The update waits for `portable_install`.
#[tauri::command]
async fn portable_check(
    app: tauri::AppHandle,
    pending: tauri::State<'_, PendingUpdate>,
) -> Result<Option<String>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app
        .updater_builder()
        .target(selfupdate::PORTABLE_TARGET)
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let version = update.as_ref().map(|u| u.version.clone());
    *pending.0.lock().map_err(|e| e.to_string())? = update;
    Ok(version)
}

/// Downloads the new exe (its signature checked by the updater, like the installer's), puts it in place of this
/// one and starts it: same path, so shortcuts keep working. Progress goes to `on_event` in the updater's shape.
#[tauri::command]
async fn portable_install(
    app: tauri::AppHandle,
    exe: tauri::State<'_, Exe>,
    pending: tauri::State<'_, PendingUpdate>,
    on_event: tauri::ipc::Channel<serde_json::Value>,
) -> Result<(), String> {
    let update = {
        let mut slot = pending.0.lock().map_err(|e| e.to_string())?;
        slot.take().ok_or("no update to install")?
    };
    let mut started = false;
    let bytes = update
        .download(
            |chunk, total| {
                if !started {
                    started = true;
                    let _ = on_event.send(serde_json::json!({ "event": "Started", "data": { "contentLength": total } }));
                }
                let _ = on_event.send(serde_json::json!({ "event": "Progress", "data": { "chunkLength": chunk } }));
            },
            || {
                let _ = on_event.send(serde_json::json!({ "event": "Finished" }));
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    selfupdate::swap(&exe.0, &bytes).map_err(|e| e.to_string())?;
    diag::log("update", &format!("{} replaced by {}", app.package_info().version, update.version));
    std::process::Command::new(&exe.0).spawn().map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("panel:toggle", ());
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // remembers each window's size and position across restarts; the panel stays hidden at start
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(screen::Reference::default())
        .manage(screen::Songe::default())
        .manage(screen::InFight::default())
        .manage(screen::Reading::default())
        .manage(report::LastSent::default())
        .manage(PendingUpdate::default())
        .setup(|app| {
            // a portable copy that updated itself: its previous exe was renamed, delete it
            let exe = std::env::current_exe().unwrap_or_default();
            selfupdate::clean(&exe);
            app.manage(Exe(exe));
            if let Ok(dir) = app.path().app_local_data_dir() {
                diag::init(dir.join("logs"));
            }
            diag::log(
                "start",
                &format!("Dofight {} on Windows", app.package_info().version),
            );
            let reference = app.state::<screen::Reference>().inner().clone();
            let songe = app.state::<screen::Songe>().inner().clone();
            let in_fight = app.state::<screen::InFight>().inner().clone();
            let reading = app.state::<screen::Reading>().inner().clone();
            screen::start(app.handle().clone(), reference, songe, in_fight, reading);
            // Dofight opens at launch (its taskbar button « Dofight » then stays until the player quits)
            if let Some(panel) = app.get_webview_window("panel") {
                let _ = panel.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            quit,
            list_dofus_windows,
            set_reference,
            read_again,
            focus_dofus,
            send_report,
            log_event,
            diagnostic_text,
            open_log_folder,
            panel_show,
            set_shortcut,
            set_songe,
            set_in_fight,
            set_reading,
            update_kind,
            portable_check,
            portable_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dofight");
}
