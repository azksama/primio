use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tokio::net::UdpSocket;
use url::Url;
#[derive(Clone, Serialize)]
pub struct Device {
    id: String,
    name: String,
    #[serde(skip)]
    control: String,
    #[serde(skip)]
    service: String,
}
static DEVICES: OnceLock<Mutex<HashMap<String, Device>>> = OnceLock::new();
fn registry() -> &'static Mutex<HashMap<String, Device>> {
    DEVICES.get_or_init(|| Mutex::new(HashMap::new()))
}
fn local_url(raw: &str, peer: IpAddr) -> Result<Url, String> {
    let u = Url::parse(raw).map_err(|_| "Invalid device URL")?;
    let local = match peer {
        IpAddr::V4(ip) => ip.is_private(),
        IpAddr::V6(ip) => (ip.segments()[0] & 0xfe00) == 0xfc00,
    };
    if !local
        || u.scheme() != "http"
        || u.host_str().and_then(|h| h.parse::<IpAddr>().ok()) != Some(peer)
        || !u.username().is_empty()
        || u.password().is_some()
    {
        return Err("Device must be on the local network".into());
    }
    Ok(u)
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())
}
async fn bounded(mut r: reqwest::Response) -> Result<String, String> {
    if !r.status().is_success() {
        return Err("TV rejected the command".into());
    }
    let mut data = Vec::new();
    while let Some(chunk) = r.chunk().await.map_err(|_| "TV response interrupted")? {
        if data.len() + chunk.len() > 262144 {
            return Err("TV response too large".into());
        }
        data.extend_from_slice(&chunk);
    }
    String::from_utf8(data).map_err(|_| "Invalid TV response".into())
}
async fn describe(raw: String, peer: IpAddr) -> Result<Device, String> {
    let url = local_url(&raw, peer)?;
    let xml = bounded(
        client()?
            .get(url.clone())
            .send()
            .await
            .map_err(|_| "TV unavailable")?,
    )
    .await?;
    let doc = roxmltree::Document::parse(&xml).map_err(|_| "Invalid device description")?;
    let service = doc
        .descendants()
        .find(|n| {
            n.has_tag_name("service")
                && n.children().any(|v| {
                    v.has_tag_name("serviceType")
                        && v.text()
                            .unwrap_or("")
                            .starts_with("urn:schemas-upnp-org:service:AVTransport:")
                })
        })
        .ok_or("TV has no media transport")?;
    let value = |name: &str| {
        service
            .children()
            .find(|n| n.has_tag_name(name))
            .and_then(|n| n.text())
            .unwrap_or("")
    };
    let control = url
        .join(value("controlURL"))
        .map_err(|_| "Invalid transport URL")?;
    local_url(control.as_str(), peer)?;
    let name = doc
        .descendants()
        .find(|n| n.has_tag_name("friendlyName"))
        .and_then(|n| n.text())
        .unwrap_or("TV")
        .chars()
        .take(100)
        .collect();
    Ok(Device {
        id: control.to_string(),
        name,
        control: control.to_string(),
        service: value("serviceType").to_owned(),
    })
}
#[tauri::command]
pub async fn cast_discover() -> Result<Vec<Device>, String> {
    let socket = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|_| "Local network unavailable")?;
    socket.send_to(b"M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n","239.255.255.250:1900").await.map_err(|_|"Discovery failed")?;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    let mut buffer = vec![0; 8192];
    let mut found = HashMap::new();
    while let Ok(Ok((n, peer))) =
        tokio::time::timeout_at(deadline, socket.recv_from(&mut buffer)).await
    {
        for line in String::from_utf8_lossy(&buffer[..n]).lines() {
            if let Some((key, value)) = line.split_once(':') {
                if key.eq_ignore_ascii_case("location") && found.len() < 16 {
                    found.insert(value.trim().to_owned(), peer.ip());
                }
            }
        }
    }
    let mut tasks = tokio::task::JoinSet::new();
    for (url, peer) in found {
        tasks.spawn(describe(url, peer));
    }
    let mut result = Vec::new();
    while let Some(item) = tasks.join_next().await {
        if let Ok(Ok(device)) = item {
            result.push(device);
        }
    }
    let mut map = registry().lock().map_err(|_| "Discovery busy")?;
    if map.len() > 128 {
        map.clear();
    }
    for device in &result {
        map.insert(device.id.clone(), device.clone());
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result.dedup_by(|a, b| a.id == b.id);
    Ok(result)
}
fn escape(v: &str) -> String {
    v.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
async fn soap(device: &Device, action: &str, args: &str) -> Result<String, String> {
    let body=format!("<?xml version=\"1.0\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body><u:{action} xmlns:u=\"{}\"><InstanceID>0</InstanceID>{args}</u:{action}></s:Body></s:Envelope>",escape(&device.service));
    bounded(
        client()?
            .post(&device.control)
            .header("Content-Type", "text/xml; charset=utf-8")
            .header("SOAPAction", format!("\"{}#{action}\"", device.service))
            .body(body)
            .send()
            .await
            .map_err(|_| "TV unavailable")?,
    )
    .await
}
fn seconds(value: &str) -> f64 {
    let p: Vec<_> = value
        .split(':')
        .filter_map(|s| s.parse::<f64>().ok())
        .collect();
    if p.len() == 3 {
        p[0] * 3600.0 + p[1] * 60.0 + p[2]
    } else {
        0.0
    }
}
#[tauri::command]
pub async fn cast_control(
    id: String,
    action: String,
    url: Option<String>,
    position: Option<f64>,
) -> Result<Value, String> {
    let device = registry()
        .lock()
        .map_err(|_| "TV unavailable")?
        .get(&id)
        .cloned()
        .ok_or("Discover this TV first")?;
    match action.as_str() {
        "load" => {
            let url = url.ok_or("Missing media")?;
            crate::network::validate_media(&url)?;
            soap(
                &device,
                "SetAVTransportURI",
                &format!(
                    "<CurrentURI>{}</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>",
                    escape(&url)
                ),
            )
            .await?;
            soap(&device, "Play", "<Speed>1</Speed>").await?;
        }
        "play" => {
            soap(&device, "Play", "<Speed>1</Speed>").await?;
        }
        "pause" => {
            soap(&device, "Pause", "").await?;
        }
        "stop" => {
            soap(&device, "Stop", "").await?;
        }
        "seek" => {
            let p = position
                .filter(|p| p.is_finite() && *p >= 0.0 && *p <= 86400.0)
                .ok_or("Invalid position")? as u64;
            soap(
                &device,
                "Seek",
                &format!(
                    "<Unit>REL_TIME</Unit><Target>{:02}:{:02}:{:02}</Target>",
                    p / 3600,
                    (p / 60) % 60,
                    p % 60
                ),
            )
            .await?;
        }
        "status" => {
            let xml = soap(&device, "GetPositionInfo", "").await?;
            let doc = roxmltree::Document::parse(&xml).map_err(|_| "Invalid TV status")?;
            let get = |name: &str| {
                seconds(
                    doc.descendants()
                        .find(|n| n.has_tag_name(name))
                        .and_then(|n| n.text())
                        .unwrap_or(""),
                )
            };
            return Ok(json!({"position":get("RelTime"),"duration":get("TrackDuration")}));
        }
        _ => return Err("Invalid TV command".into()),
    };
    Ok(json!({"ok":true}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovered_urls_stay_on_the_same_lan_device() {
        let peer = "192.168.1.20".parse().unwrap();
        assert!(local_url("http://192.168.1.20:1400/desc.xml", peer).is_ok());
        for u in [
            "http://127.0.0.1/x",
            "http://example.com/x",
            "https://192.168.1.20/x",
            "http://user:secret@192.168.1.20/x",
        ] {
            assert!(local_url(u, peer).is_err());
        }
    }
    #[test]
    fn soap_values_are_escaped() {
        assert_eq!(escape("a&b<c>\""), "a&amp;b&lt;c&gt;&quot;");
        assert_eq!(seconds("01:02:03"), 3723.0);
    }
}
