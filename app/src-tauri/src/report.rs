//! « Suggérer »: posts a player's report (built by the front end) to the Dofight Discord webhook.
//! The webhook URL is set at build time (`DOFIGHT_WEBHOOK`); without it the button explains that sending is not set up.

use std::sync::Mutex;
use std::time::{Duration, Instant};

const COOLDOWN: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct LastSent(pub Mutex<Option<Instant>>);

pub fn webhook() -> Option<&'static str> {
    option_env!("DOFIGHT_WEBHOOK")
        .filter(|u| u.starts_with("https://") || u.starts_with("http://127.0.0.1"))
}

/// Posts `body` (JSON) to `url`, with `file` (name, text) attached when given; Discord answers 2xx on success.
pub async fn post(url: &str, body: &serde_json::Value, file: Option<(&str, String)>) -> Result<(), String> {
    // reqwest uses rustls without a default provider (the updater's setup): install ring once
    let _ = rustls::crypto::ring::default_provider().install_default();
    let request = reqwest::Client::new().post(url).timeout(Duration::from_secs(30));
    let request = match file {
        // Discord: the message as « payload_json », the file as « files[0] »
        Some((name, text)) => {
            let part = reqwest::multipart::Part::text(text)
                .file_name(name.to_string())
                .mime_str("text/plain")
                .map_err(|_| "network".to_string())?;
            let form = reqwest::multipart::Form::new()
                .text("payload_json", body.to_string())
                .part("files[0]", part);
            request.multipart(form)
        }
        None => request.json(body),
    };
    let res = request.send().await.map_err(|_| "network".to_string())?;
    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("http-{}", res.status().as_u16()))
    }
}

/// Error codes the front end turns into French: "not-configured", "cooldown", "network", "too-big", "http-NNN".
/// `log`: the recent diagnostic log, attached as « dofight-log.txt » when the player left it on.
pub async fn send(body: serde_json::Value, log: Option<String>, last: &LastSent) -> Result<(), String> {
    let url = webhook().ok_or("not-configured")?;
    if body.to_string().len() > 6000 {
        return Err("too-big".into());
    }
    {
        let mut guard = last.0.lock().map_err(|_| "network")?;
        if guard.is_some_and(|t| t.elapsed() < COOLDOWN) {
            return Err("cooldown".into());
        }
        *guard = Some(Instant::now());
    }
    let out = post(url, &body, log.filter(|l| !l.is_empty()).map(|l| ("dofight-log.txt", l))).await;
    if out.is_err() {
        *last.0.lock().map_err(|_| "network")? = None; // a failed send does not use the minute
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn posts_the_json_body() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/hook", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            let mut buf = vec![0u8; 8192];
            let mut got = Vec::new();
            loop {
                let n = sock.read(&mut buf).unwrap();
                got.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&got);
                if let Some(i) = text.find("\r\n\r\n") {
                    let len: usize = text
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse().unwrap())
                        })
                        .unwrap_or(0);
                    if got.len() >= i + 4 + len {
                        break;
                    }
                }
            }
            sock.write_all(b"HTTP/1.1 204 No Content\r\n\r\n").unwrap();
            String::from_utf8(got).unwrap()
        });
        let rt =
            tauri::async_runtime::block_on(post(&url, &serde_json::json!({"username": "Dofight"}), None));
        assert_eq!(rt, Ok(()));
        let request = server.join().unwrap();
        assert!(request.starts_with("POST /hook"));
        assert!(request.ends_with(r#"{"username":"Dofight"}"#));
    }

    #[test]
    fn without_a_webhook_sending_is_not_configured() {
        if webhook().is_none() {
            let out =
                tauri::async_runtime::block_on(send(serde_json::json!({}), None, &LastSent::default()));
            assert_eq!(out, Err("not-configured".into()));
        }
    }
}
