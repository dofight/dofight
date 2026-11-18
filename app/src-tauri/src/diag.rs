//! The diagnostic log: what Dofight understood and did, to debug a player's odd behaviour (sent with a suggestion
//! when the player leaves « Joindre le journal » on, or copied from the settings).
//!
//! Never written: raw screen text (it can hold chat, character or guild names), window titles (character names),
//! the reference window setting. Only cleaned-up facts: zone names, monster names, fight state, timings, errors.
//!
//! `%LOCALAPPDATA%\<app id>\logs\dofight.log`, moved to `dofight.1.log` past MAX_BYTES (one archive kept).

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_BYTES: u64 = 1_000_000;
/// What a suggestion attaches at most (Discord takes far more; this keeps reports readable).
const RECENT_MAX_BYTES: usize = 200_000;

static DIR: OnceLock<PathBuf> = OnceLock::new();
static WRITE: Mutex<()> = Mutex::new(());

pub fn init(dir: PathBuf) {
    let _ = fs::create_dir_all(&dir);
    let _ = DIR.set(dir);
}

pub fn dir() -> Option<&'static PathBuf> {
    DIR.get()
}

fn current() -> Option<PathBuf> {
    DIR.get().map(|d| d.join("dofight.log"))
}

fn archive() -> Option<PathBuf> {
    DIR.get().map(|d| d.join("dofight.1.log"))
}

/// One line: `2026-11-08T11:02:03.456Z [area] message` (UTC). Never fails: a log must not break the app.
pub fn log(area: &str, message: &str) {
    let Some(path) = current() else { return };
    let _guard = WRITE.lock();
    if fs::metadata(&path).is_ok_and(|m| m.len() > MAX_BYTES)
        && let Some(old) = archive()
    {
        let _ = fs::rename(&path, old);
    }
    let line = format!("{} [{area}] {}\n", iso(SystemTime::now()), message.replace(['\r', '\n'], " "));
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(line.as_bytes());
    }
}

/// The lines of the last `minutes` (both files), at most RECENT_MAX_BYTES (the newest kept).
pub fn recent(minutes: u64) -> String {
    let cutoff = iso(SystemTime::now() - Duration::from_secs(minutes * 60));
    let mut out = String::new();
    for path in [archive(), current()].into_iter().flatten() {
        if let Ok(text) = fs::read_to_string(path) {
            for line in text.lines().filter(|l| l.get(..24).is_some_and(|ts| ts >= cutoff.as_str())) {
                out.push_str(line);
                out.push('\n');
            }
        }
    }
    if out.len() > RECENT_MAX_BYTES {
        let mut start = out.len() - RECENT_MAX_BYTES;
        while !out.is_char_boundary(start) {
            start += 1;
        }
        out = out[start..].to_string();
    }
    out
}

/// ISO 8601 UTC with milliseconds, from the Unix time (no date crate needed).
pub fn iso(t: SystemTime) -> String {
    let d = t.duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = d.as_secs();
    let (days, rem) = ((secs / 86_400) as i64, secs % 86_400);
    // civil date from days since 1970-01-01 (Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60,
        d.subsec_millis()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_iso_utc_times() {
        assert_eq!(iso(UNIX_EPOCH), "1970-01-01T00:00:00.000Z");
        // 2026-11-08 10:30:15.250 UTC
        let t = UNIX_EPOCH + Duration::from_millis(1_794_133_815_250);
        assert_eq!(iso(t), "2026-11-08T10:30:15.250Z");
        let leap = UNIX_EPOCH + Duration::from_secs(951_782_400); // 2000-02-29
        assert_eq!(&iso(leap)[..10], "2000-02-29");
    }
}
