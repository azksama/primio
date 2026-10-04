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
#[derive(Serialize)]
pub struct UpdateStatus {
    #[serde(flatten)]
    update: Update,
    downloaded: bool,
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
async fn latest_update(app: &tauri::AppHandle) -> Result<Option<Update>, String> {
    let manifest =
        crate::network::fetch_json("https://primio-api.azks.fr/api/v1/app-release").await?;
    let platform = if cfg!(target_os = "android") {
        "android"
    } else {
        "windows"
    };
    parse_update(&manifest, platform, &app.package_info().version.to_string())
}
fn parse_update(
    manifest: &serde_json::Value,
    platform: &str,
    current: &str,
) -> Result<Option<Update>, String> {
    let Some(artifact) = manifest["platforms"].get(platform) else {
        return Ok(None);
    };
    let mut artifact = artifact
        .as_object()
        .cloned()
        .ok_or("Invalid update manifest")?;
    artifact.insert("version".into(), manifest["version"].clone());
    let update: Update = serde_json::from_value(serde_json::Value::Object(artifact))
        .map_err(|_| "Invalid update manifest")?;
    if valid(&update, current) {
        Ok(Some(update))
    } else {
        Ok(None)
    }
}
fn artifact_path(directory: &std::path::Path, update: &Update) -> PathBuf {
    directory.join(format!("primio-{}.{}", update.version, extension()))
}
fn remove_cached(directory: &std::path::Path, update: &Update) {
    if version(&update.version).is_some() {
        let _ = std::fs::remove_file(artifact_path(directory, update));
    }
    let _ = std::fs::remove_file(directory.join("ready.json"));
}
fn prune_artifacts(directory: &std::path::Path, keep: Option<&Update>) {
    let retained = keep.map(|update| artifact_path(directory, update));
    if let Ok(entries) = std::fs::read_dir(directory) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let known = name
                .strip_prefix("primio-")
                .and_then(|name| name.rsplit_once('.'))
                .is_some_and(|(candidate, ext)| {
                    version(candidate).is_some() && (ext == extension() || ext == "partial")
                });
            if known
                && retained.as_ref() != Some(&path)
                && entry.file_type().is_ok_and(|kind| kind.is_file())
            {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}
async fn cached_ready(directory: &std::path::Path, current: &str, latest: Option<&Update>) -> bool {
    let bytes = tokio::fs::read(directory.join("ready.json"))
        .await
        .unwrap_or_default();
    let Ok(cached) = serde_json::from_slice::<Update>(&bytes) else {
        let _ = std::fs::remove_file(directory.join("ready.json"));
        prune_artifacts(directory, None);
        return false;
    };
    let matches = valid(&cached, current)
        && latest.is_some_and(|next| {
            cached.version == next.version
                && cached.sha256 == next.sha256
                && cached.size == next.size
                && cached.url == next.url
        });
    if matches
        && verify(&artifact_path(directory, &cached), &cached)
            .await
            .is_ok()
    {
        prune_artifacts(directory, Some(&cached));
        return true;
    }
    remove_cached(directory, &cached);
    prune_artifacts(directory, None);
    false
}
#[tauri::command]
pub async fn update_check(app: tauri::AppHandle) -> Result<Option<UpdateStatus>, String> {
    let _guard = DOWNLOAD
        .try_lock()
        .map_err(|_| "Update already downloading")?;
    cleanup(&app);
    let next = latest_update(&app).await?;
    let downloaded = cached_ready(
        &directory(&app)?,
        &app.package_info().version.to_string(),
        next.as_ref(),
    )
    .await;
    Ok(next.map(|update| UpdateStatus { update, downloaded }))
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
    // This buffer lives across await points. Keep it off the IPC thread's stack.
    let mut buffer = vec![0u8; 65536];
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
    let update = latest_update(&app).await?.ok_or("No update available")?;
    let directory = directory(&app)?;
    if cached_ready(
        &directory,
        &app.package_info().version.to_string(),
        Some(&update),
    )
    .await
    {
        return Ok(update.version);
    }
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
    let _guard = DOWNLOAD
        .try_lock()
        .map_err(|_| "Update already downloading")?;
    let directory = directory(&app)?;
    let latest = latest_update(&app).await?;
    if !cached_ready(
        &directory,
        &app.package_info().version.to_string(),
        latest.as_ref(),
    )
    .await
    {
        return Err("Download the latest update first".into());
    }
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
pub fn cleanup(app: &tauri::AppHandle) {
    let Ok(directory) = directory(app) else {
        return;
    };
    let cached = std::fs::read(directory.join("ready.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Update>(&bytes).ok());
    let retained = cached
        .as_ref()
        .filter(|update| valid(update, &app.package_info().version.to_string()));
    if retained.is_none() {
        let _ = std::fs::remove_file(directory.join("ready.json"));
    }
    prune_artifacts(&directory, retained);
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_release_artifacts_return_an_error_without_panicking() {
        use serde_json::json;
        for artifact in [
            json!([]),
            json!(true),
            json!(42),
            json!("artifact"),
            json!(null),
        ] {
            let manifest = json!({"version":"1.1.0","platforms":{"windows":artifact}});
            assert!(parse_update(&manifest, "windows", "1.0.0").is_err());
        }
        let manifest = json!({"version":"1.1.0","platforms":{"windows":{
            "url": format!("https://github.com/azksama/primio/releases/download/v1.1.0/Primio.{}", extension()),
            "sha256":"a".repeat(64),"size":1_000_000
        }}});
        assert_eq!(
            parse_update(&manifest, "windows", "1.0.0")
                .unwrap()
                .unwrap()
                .version,
            "1.1.0"
        );
        assert!(parse_update(&manifest, "windows", "1.1.0")
            .unwrap()
            .is_none());
        assert!(parse_update(&manifest, "missing", "1.0.0")
            .unwrap()
            .is_none());
    }
    #[test]
    fn checksum_task_stays_small_on_the_webview_thread() {
        let update = Update {
            version: "0.2.10".into(),
            url: String::new(),
            sha256: String::new(),
            size: 0,
        };
        let task = verify(std::path::Path::new("unused.apk"), &update);
        let size = std::mem::size_of_val(&task);
        assert!(
            size < 4096,
            "Checksum task occupies {size} bytes on the IPC stack"
        );
    }
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
    #[tokio::test]
    async fn reuses_verified_installers_and_removes_obsolete_or_corrupt_downloads() {
        let directory = std::env::temp_dir().join(format!(
            "primio-update-cache-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        tokio::fs::create_dir_all(&directory).await.unwrap();
        let bytes = vec![42u8; 100_001];
        let cached = Update {
            version: "1.0.0".into(),
            url: format!(
                "https://github.com/azksama/primio/releases/download/v1.0.0/Primio.{}",
                extension()
            ),
            size: bytes.len() as u64,
            sha256: format!("{:x}", Sha256::digest(&bytes)),
        };
        async fn save(directory: &std::path::Path, update: &Update, bytes: &[u8]) {
            tokio::fs::write(artifact_path(directory, update), bytes)
                .await
                .unwrap();
            tokio::fs::write(
                directory.join("ready.json"),
                serde_json::to_vec(update).unwrap(),
            )
            .await
            .unwrap();
        }
        save(&directory, &cached, &bytes).await;
        assert!(cached_ready(&directory, "0.2.21", Some(&cached)).await);
        assert!(artifact_path(&directory, &cached).exists());
        // Installed version caught up: delete even if the release feed still advertises it.
        assert!(!cached_ready(&directory, "1.0.0", Some(&cached)).await);
        assert!(!artifact_path(&directory, &cached).exists());
        save(&directory, &cached, &bytes).await;
        let latest = Update {
            version: "1.0.1".into(),
            ..cached.clone()
        };
        assert!(!cached_ready(&directory, "0.2.21", Some(&latest)).await);
        assert!(!artifact_path(&directory, &cached).exists());
        save(&directory, &cached, &vec![0u8; bytes.len()]).await;
        assert!(!cached_ready(&directory, "0.2.21", Some(&cached)).await);
        tokio::fs::write(directory.join("primio-1.0.0.partial"), b"partial")
            .await
            .unwrap();
        tokio::fs::write(directory.join("unrelated.txt"), b"keep")
            .await
            .unwrap();
        tokio::fs::write(directory.join("ready.json"), b"invalid")
            .await
            .unwrap();
        assert!(!cached_ready(&directory, "0.2.21", Some(&cached)).await);
        assert!(!directory.join("primio-1.0.0.partial").exists());
        assert!(directory.join("unrelated.txt").exists());
        tokio::fs::remove_file(directory.join("unrelated.txt"))
            .await
            .unwrap();
        tokio::fs::remove_dir(directory).await.unwrap();
    }
}
