use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{path::PathBuf, time::Duration};
use tauri::{Emitter, Manager};
use tokio::io::AsyncWriteExt;

static DOWNLOAD: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
#[derive(Clone, Serialize, Deserialize)]
pub struct Update {
    pub version: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
}
fn version(value: &str) -> Option<Vec<u32>> {
    let parts: Vec<_> = value.split('.').collect();
    if parts.len() != 3
        || parts
            .iter()
            .any(|p| p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()))
    {
        return None;
    }
    parts.iter().map(|p| p.parse::<u32>().ok()).collect()
}
fn extension() -> &'static str {
    if cfg!(target_os = "android") {
        "apk"
    } else {
        "exe"
    }
}
fn directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("updates");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}
fn valid(update: &Update, current: &str) -> bool {
    let Some(candidate) = version(&update.version) else {
        return false;
    };
    let Some(current) = version(current) else {
        return false;
    };
    candidate > current
        && update.size > 100_000
        && update.size < 250_000_000
        && update.sha256.len() == 64
        && update.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        && update
            .url
            .starts_with("https://github.com/azksama/primio/releases/download/")
        && update.url.ends_with(&format!(".{}", extension()))
}
#[tauri::command]
pub async fn update_check(app: tauri::AppHandle) -> Result<Option<Update>, String> {
    let manifest =
        crate::network::fetch_json("https://primio-api.azks.fr/api/v1/app-release").await?;
    let platform = if cfg!(target_os = "android") {
        "android"
    } else {
        "windows"
    };
    let Some(artifact) = manifest["platforms"].get(platform) else {
        return Ok(None);
    };
    let mut artifact = artifact.clone();
    artifact["version"] = manifest["version"].clone();
    let update: Update = serde_json::from_value(artifact).map_err(|_| "Invalid update manifest")?;
    if valid(&update, &app.package_info().version.to_string()) {
        Ok(Some(update))
    } else {
        Ok(None)
    }
}
async fn verify(path: &std::path::Path, update: &Update) -> Result<(), String> {
    use tokio::io::AsyncReadExt;
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|_| "Update file unavailable")?;
    if file
        .metadata()
        .await
        .map_err(|_| "Update file unavailable")?
        .len()
        != update.size
    {
        return Err("Invalid update size".into());
    }
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = file
            .read(&mut buffer)
            .await
            .map_err(|_| "Update read failed")?;
        if n == 0 {
            break;
        };
        hash.update(&buffer[..n]);
    }
    if format!("{:x}", hash.finalize()) != update.sha256.to_lowercase() {
        return Err("Invalid update checksum".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn update_download(app: tauri::AppHandle) -> Result<String, String> {
    let _guard = DOWNLOAD
        .try_lock()
        .map_err(|_| "Update already downloading")?;
    let update = update_check(app.clone())
        .await?
        .ok_or("No update available")?;
    let directory = directory(&app)?;
    let file = directory.join(format!("primio-{}.{}", update.version, extension()));
    let temporary = file.with_extension("partial");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 5
                || attempt.url().scheme() != "https"
                || !matches!(
                    attempt.url().host_str(),
                    Some(
                        "github.com"
                            | "release-assets.githubusercontent.com"
                            | "objects.githubusercontent.com"
                    )
                )
            {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|_| "Update connection failed")?;
    let mut response = client
        .get(&update.url)
        .send()
        .await
        .map_err(|_| "Update download failed")?;
    if !response.status().is_success() {
        return Err("Update download unavailable".into());
    }
    let result = async {
        let mut output = tokio::fs::File::create(&temporary)
            .await
            .map_err(|_| "Cannot save update")?;
        let mut size = 0u64;
        let mut last = std::time::Instant::now();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Update download interrupted")?
        {
            size += chunk.len() as u64;
            if size > update.size {
                return Err("Update too large");
            }
            output
                .write_all(&chunk)
                .await
                .map_err(|_| "Cannot save update")?;
            if last.elapsed().as_millis() > 100 {
                let _ = app.emit(
                    "update-progress",
                    serde_json::json!({"received":size,"total":update.size}),
                );
                last = std::time::Instant::now();
            }
        }
        output.flush().await.map_err(|_| "Cannot save update")?;
        Ok::<_, &str>(())
    }
    .await;
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(error.into());
    }
    if let Err(error) = verify(&temporary, &update).await {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(error);
    }
    tokio::fs::rename(&temporary, &file)
        .await
        .map_err(|_| "Cannot finalize update")?;
    tokio::fs::write(
        directory.join("ready.json"),
        serde_json::to_vec(&update).map_err(|_| "Invalid update")?,
    )
    .await
    .map_err(|_| "Cannot finalize update")?;
    let _ = app.emit(
        "update-progress",
        serde_json::json!({"received":update.size,"total":update.size}),
    );
    Ok(update.version)
}
#[tauri::command]
pub async fn update_install(app: tauri::AppHandle) -> Result<(), String> {
    let directory = directory(&app)?;
    let update: Update = serde_json::from_slice(
        &tokio::fs::read(directory.join("ready.json"))
            .await
            .map_err(|_| "Download the update first")?,
    )
    .map_err(|_| "Invalid update")?;
    if !valid(&update, &app.package_info().version.to_string()) {
        return Err("Invalid update version".into());
    }
    let file = directory.join(format!("primio-{}.{}", update.version, extension()));
    verify(&file, &update).await?;
    #[cfg(target_os = "android")]
    crate::mobile_call(
        &app,
        "installUpdate",
        serde_json::json!({"path":file.to_string_lossy()}),
    )?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new(file)
            .args(["/UPDATE", "/R"])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|_| "Cannot start installer")?;
        crate::desktop_player::stop();
        app.exit(0);
    }
    Ok(())
}
#[cfg(target_os = "windows")]
pub fn cleanup(app: &tauri::AppHandle) {
    let Ok(directory) = directory(app) else {
        return;
    };
    let Ok(bytes) = std::fs::read(directory.join("ready.json")) else {
        return;
    };
    let Ok(update) = serde_json::from_slice::<Update>(&bytes) else {
        return;
    };
    if let (Some(downloaded), Some(installed)) = (
        version(&update.version),
        version(&app.package_info().version.to_string()),
    ) {
        if downloaded <= installed {
            let file = directory.join(format!("primio-{}.{}", update.version, extension()));
            if std::fs::remove_file(file).is_ok() {
                let _ = std::fs::remove_file(directory.join("ready.json"));
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_downgrades_untrusted_hosts_and_bad_checksums() {
        let mut u = Update {
            version: "0.2.8".into(),
            url: format!(
                "https://github.com/azksama/primio/releases/download/v0.2.8/primio.{}",
                extension()
            ),
            sha256: "a".repeat(64),
            size: 1_000_000,
        };
        assert!(valid(&u, "0.2.7"));
        assert!(!valid(&u, "0.2.8"));
        u.url = "https://evil.test/installer.exe".into();
        assert!(!valid(&u, "0.2.7"));
        assert!(version("../../1").is_none());
        assert!(version("+1.2.3").is_none());
    }
    #[tokio::test]
    async fn verifies_downloaded_bytes_before_installation() {
        let path =
            std::env::temp_dir().join(format!("primio-update-test-{}.bin", std::process::id()));
        let bytes = b"an installer fixture";
        tokio::fs::write(&path, bytes).await.unwrap();
        let mut update = Update {
            version: "0.2.8".into(),
            url: String::new(),
            size: bytes.len() as u64,
            sha256: format!("{:x}", Sha256::digest(bytes)),
        };
        assert!(verify(&path, &update).await.is_ok());
        update.sha256 = "0".repeat(64);
        assert!(verify(&path, &update).await.is_err());
        update.size += 1;
        assert!(verify(&path, &update).await.is_err());
        tokio::fs::remove_file(path).await.unwrap();
    }
}
