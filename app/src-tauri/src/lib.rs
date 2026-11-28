pub mod diag;
pub mod iconbar;
mod iconbar_refs;
pub mod ocr;
pub mod platform;
pub mod report;
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

/// A new side window, made from `peek`'s config, for the next sheet once the current one was detached (dragged away,
/// owner 2026-11-20): its label, the first free `peek-N` (the panel's page may have reloaded since the last one).
/// Async: making a window from a sync command deadlocks on Windows.
#[tauri::command]
async fn side_window(app: tauri::AppHandle) -> Result<String, String> {
    let label = (1..).map(|n| format!("peek-{n}")).find(|l| app.get_webview_window(l).is_none()).expect("a free label");
    let mut config = app.config().app.windows.iter().find(|w| w.label == "peek").cloned().ok_or("no peek config")?;
    config.label = label.clone();
    let side = tauri::WebviewWindowBuilder::from_config(&app, &config).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
    platform::float_side(&side);
    Ok(label)
}

/// The sheet the page names was dragged away: it may take the keyboard from now on (Escape closes it), and the
/// player may resize it (owner, 2026-11-22), down to a size still worth reading. Beside the panel the panel sizes it.
#[tauri::command]
fn side_detached(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let side = app.get_webview_window(&label).ok_or("no such window")?;
    side.set_min_size(Some(tauri::LogicalSize::new(200.0, 120.0))).map_err(|e| e.to_string())?;
    side.set_resizable(true).map_err(|e| e.to_string())?;
    platform::detached_side(&side);
    Ok(())
}

/// A detached sheet folded to its bar, or unfolded (owner, 2026-11-27): the window takes `height` (logical px, the
/// page measured it). Folded, it is held at that height (its edges still widen it); unfolded, the usual minimum is back.
#[tauri::command]
fn side_fold(app: tauri::AppHandle, label: String, folded: bool, height: f64) -> Result<(), String> {
    let side = app.get_webview_window(&label).ok_or("no such window")?;
    let scale = side.scale_factor().map_err(|e| e.to_string())?;
    let width = side.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale).width;
    side.set_min_size(Some(tauri::LogicalSize::new(200.0, if folded { height } else { 120.0 }))).map_err(|e| e.to_string())?;
    side.set_max_size(if folded { Some(tauri::LogicalSize::new(10_000.0, height)) } else { None }).map_err(|e| e.to_string())?;
    side.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Shows the side window the page names, without taking the focus (platform::show_side). `resizable`: a pinned sheet,
/// whose edges the player may pull, which detaches it (owner, 2026-11-24); a hover preview is not.
#[tauri::command]
fn side_show(app: tauri::AppHandle, label: String, resizable: Option<bool>) -> Result<(), String> {
    let side = app.get_webview_window(&label).ok_or("no such window")?;
    side.set_resizable(resizable.unwrap_or(false)).map_err(|e| e.to_string())?;
    platform::show_side(&side);
    Ok(())
}

/// "Fermer Dofight": closes every window, icon included.
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    diag::log("quit", "asked from the panel (the × of the title bar)");
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

/// Saves every window's size and place now (the plugin also saves at exit, which a killed Dofight never reaches). On
/// the main thread: the plugin's own command holds its lock while asking each window for its size, which on macOS waits
/// for the main thread, itself waiting for that lock in the next Resized or Moved event, so the panel froze while it
/// was moved or resized (owner, 2026-11-20).
#[tauri::command]
fn save_geometry(app: tauri::AppHandle) {
    use tauri_plugin_window_state::AppHandleExt;
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = handle.save_window_state(StateFlags::all() & !StateFlags::VISIBLE);
    });
}

/// The overlay panel, never activated (the game keeps the focus): "open" restores it, "min" leaves only its
/// taskbar button (the shortcut, the auto close and « Masquer Dofight hors de Dofus » all use it), "hidden" removes it
/// from the taskbar too (not used by the page today: the taskbar button always stays).
#[tauri::command]
fn panel_show(app: tauri::AppHandle, mode: String) -> Result<(), String> {
    let panel = app.get_webview_window("panel").ok_or("no panel")?;
    platform::show_panel(&panel, &mode)
}

/// A build with the dev tools in it. `import.meta.env.DEV` is not that: it is true under Vite's dev server alone, so
/// a `tauri build --debug` bundle had the red boxes compiled in and no way to turn them on (owner, 2026-11-21).
#[tauri::command]
fn dev_build() -> bool {
    cfg!(debug_assertions)
}

/// Dev builds: shows or hides the red boxes of the areas read (the « debug » window, made only in dev builds; in a
/// release there is no such window and no switch).
#[tauri::command]
fn set_debug_areas(app: tauri::AppHandle, on: bool, wanted: tauri::State<DebugAreasOn>) -> Result<(), String> {
    wanted.0.store(on, std::sync::atomic::Ordering::Relaxed);
    // at launch the panel may ask before the setup made the window: the setup shows it then (owner, 2026-11-20)
    let Some(debug) = app.get_webview_window("debug") else {
        diag::log("debug", &format!("red boxes {on}, overlay window not there yet"));
        return Ok(());
    };
    diag::log("debug", &format!("red boxes {on}"));
    if on { debug.show() } else { debug.hide() }.map_err(|e| e.to_string())
}

/// Whether the red boxes are wanted (dev builds), kept for the debug window made after the panel asked.
#[derive(Default)]
struct DebugAreasOn(std::sync::atomic::AtomicBool);

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

/// « Scanner ma sous-zone » (the reading off): Dofus is brought in front, then the corner is read SCAN_READS times
/// (`screen:scan`), and nothing more.
#[tauri::command]
fn scan_now(reading: tauri::State<screen::Reading>, reference: tauri::State<screen::Reference>) -> bool {
    if let Ok(mut a) = reading.1.lock() {
        *a = Some((std::time::Instant::now(), screen::SCAN_READS));
    }
    let prefix = reference.0.lock().map(|p| p.clone()).unwrap_or_default();
    let front = screen::focus_reference(&prefix);
    diag::log("screen", if front { "scan asked: Dofus brought in front" } else { "scan asked: Dofus could not be brought in front" });
    front
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
    // macOS: the updater replaces the whole .app bundle, like the Windows installer does
    if cfg!(not(windows)) || selfupdate::is_installed(&exe.0) {
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
    let builder = tauri::Builder::default();
    // macOS: lets platform/mac.rs turn the overlay windows into non-activating NSPanels
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    builder
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // remembers each window's size and position across restarts; the panel stays hidden at start
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(screen::Reference::default())
        .manage(DebugAreasOn::default())
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
                &format!("Dofight {} on {}", app.package_info().version, if cfg!(windows) { "Windows" } else { "macOS" }),
            );
            platform::setup(app)?;
            // dev builds only: a click-through window over the screen that draws the areas read (red boxes), hidden until
            // « Encadrer en rouge les zones lues » (Diagnostic) is on
            #[cfg(debug_assertions)]
            {
                use tauri::{WebviewUrl, WebviewWindowBuilder};
                if let Some(monitor) = app.primary_monitor()? {
                    let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
                    let debug = WebviewWindowBuilder::new(app, "debug", WebviewUrl::App("debug.html".into()))
                        .title("Dofight – debug")
                        .transparent(true)
                        .decorations(false)
                        .shadow(false)
                        .always_on_top(true)
                        .skip_taskbar(true)
                        .focused(false)
                        .focusable(false)
                        .resizable(false)
                        .position(0.0, 0.0)
                        .inner_size(size.width, size.height)
                        .visible(false)
                        .build()?;
                    debug.set_ignore_cursor_events(true)?;
                    // the same as the panel and the sheets: over every Space and over a full-screen game, and not
                    // hidden when Dofight stops being the active app, which it always is. Without it the overlay was
                    // made, shown, and drew its boxes with nobody ever seeing one (owner, 2026-11-21).
                    platform::float_side(&debug);
                    let wanted = app.state::<DebugAreasOn>().0.load(std::sync::atomic::Ordering::Relaxed);
                    diag::log("debug", &format!("overlay window made, {}×{}, wanted {wanted}", size.width, size.height));
                    if wanted {
                        debug.show()?;
                    }
                } else {
                    diag::log("debug", "no primary monitor: no overlay window");
                }
            }
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
            side_window,
            set_debug_areas,
            dev_build,
            list_dofus_windows,
            set_reference,
            read_again,
            focus_dofus,
            send_report,
            log_event,
            diagnostic_text,
            open_log_folder,
            panel_show,
            side_show,
            side_detached,
            side_fold,
            save_geometry,
            set_shortcut,
            set_songe,
            set_in_fight,
            scan_now,
            set_reading,
            update_kind,
            portable_check,
            portable_install
        ])
        .build(tauri::generate_context!())
        .expect("error while running Dofight")
        // the overlay windows are Objective-C panels on macOS: their own classes go back before they are torn down
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                platform::restore_panels(app);
            }
        });
}
