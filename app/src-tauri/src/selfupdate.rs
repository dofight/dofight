//! Updating a copy of Dofight that was not installed (an exe kept on the Desktop, for instance).
//!
//! The installed Dofight updates through the signed installer, which rewrites the install folder. A copy run from
//! anywhere else would only install a second Dofight and stay old, then find the same update at every launch. So
//! such a copy replaces its own exe: Windows cannot overwrite a running exe but can rename it, so the new exe is
//! written beside it, the running one is renamed « Dofight.old.exe », the new one takes its name, and the old one is
//! deleted at the next launch. The path stays the same: shortcuts keep working.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// The release's target for this kind of copy in latest.json (the raw exe, signed like the installer).
pub const PORTABLE_TARGET: &str = "windows-x86_64-portable";

/// Installed by the NSIS installer: its uninstaller sits next to the exe.
pub fn is_installed(exe: &Path) -> bool {
    exe.parent().is_some_and(|dir| dir.join("uninstall.exe").exists())
}

fn sibling(exe: &Path, suffix: &str) -> PathBuf {
    let stem = exe.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    exe.with_file_name(format!("{stem}.{suffix}.exe"))
}

/// The renamed previous exe, deleted at the next launch.
pub fn old_path(exe: &Path) -> PathBuf {
    sibling(exe, "old")
}

/// Puts `bytes` (the new, already verified exe) in place of `exe`, which may be running. On any failure the
/// previous exe is left (or put back) where it was.
pub fn swap(exe: &Path, bytes: &[u8]) -> io::Result<()> {
    let new = sibling(exe, "new");
    let old = old_path(exe);
    fs::write(&new, bytes)?;
    let _ = fs::remove_file(&old); // a leftover from an update whose cleanup failed
    if let Err(e) = fs::rename(exe, &old) {
        let _ = fs::remove_file(&new);
        return Err(e);
    }
    if let Err(e) = fs::rename(&new, exe) {
        let _ = fs::rename(&old, exe);
        let _ = fs::remove_file(&new);
        return Err(e);
    }
    Ok(())
}

/// At launch: removes the exe a previous update renamed (it is no longer running).
pub fn clean(exe: &Path) {
    let _ = fs::remove_file(old_path(exe));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dofight-selfupdate-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn swap_puts_the_new_exe_at_the_same_path_and_keeps_the_old_one_aside() {
        let dir = folder("swap");
        let exe = dir.join("Dofight.exe");
        fs::write(&exe, b"v1").unwrap();
        swap(&exe, b"v2").unwrap();
        assert_eq!(fs::read(&exe).unwrap(), b"v2");
        assert_eq!(fs::read(dir.join("Dofight.old.exe")).unwrap(), b"v1");
        assert!(!dir.join("Dofight.new.exe").exists());
        clean(&exe);
        assert!(!dir.join("Dofight.old.exe").exists());
        assert_eq!(fs::read(&exe).unwrap(), b"v2");
    }

    #[test]
    fn swap_replaces_a_leftover_old_exe() {
        let dir = folder("leftover");
        let exe = dir.join("Dofight.exe");
        fs::write(&exe, b"v2").unwrap();
        fs::write(dir.join("Dofight.old.exe"), b"v1").unwrap();
        swap(&exe, b"v3").unwrap();
        assert_eq!(fs::read(&exe).unwrap(), b"v3");
        assert_eq!(fs::read(dir.join("Dofight.old.exe")).unwrap(), b"v2");
    }

    #[test]
    fn a_failed_swap_leaves_the_running_exe_in_place() {
        let dir = folder("fail");
        let exe = dir.join("Dofight.exe"); // missing: the rename fails
        assert!(swap(&exe, b"v2").is_err());
        assert!(!dir.join("Dofight.new.exe").exists());
    }

    #[test]
    fn an_exe_with_an_uninstaller_beside_it_is_the_installed_one() {
        let dir = folder("installed");
        let exe = dir.join("Dofight.exe");
        assert!(!is_installed(&exe));
        fs::write(dir.join("uninstall.exe"), b"").unwrap();
        assert!(is_installed(&exe));
    }
}
