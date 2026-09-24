use crate::ApiError;
use reqwest::Client;
use serde_json::Value;
use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use url::Url;

pub fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            !v.is_private()
                && !v.is_loopback()
                && !v.is_link_local()
                && !v.is_broadcast()
                && !v.is_documentation()
                && !v.is_unspecified()
                && !v.is_multicast()
                && v.octets()[0] != 0
                && v.octets()[0] < 240
                && !(v.octets()[0] == 100 && (64..=127).contains(&v.octets()[1]))
        }
        IpAddr::V6(v) => v
            .to_ipv4_mapped()
            .map(|v| public_ip(IpAddr::V4(v)))
            .unwrap_or(
                !v.is_loopback()
                    && !v.is_unspecified()
                    && !v.is_multicast()
                    && (v.segments()[0] & 0xfe00) != 0xfc00
                    && (v.segments()[0] & 0xffc0) != 0xfe80,
            ),
    }
}
pub fn validate_media(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "URL invalide")?;
    if !["https", "http"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("URL de lecture invalide".into());
    }
    Ok(url)
}
pub(crate) async fn client_for(url: &Url) -> Result<Client, String> {
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Un endpoint HTTPS public est requis.".into());
    }
    let host = url.host_str().unwrap();
    let addresses: Vec<SocketAddr> = tokio::time::timeout(
        Duration::from_secs(5),
        tokio::net::lookup_host((host, url.port_or_known_default().unwrap_or(443))),
    )
    .await
    .map_err(|_| "Délai DNS dépassé")?
    .map_err(|_| "Fournisseur introuvable")?
    .collect();
    if addresses.is_empty() || addresses.iter().any(|a| !public_ip(a.ip())) {
        return Err("Les adresses réseau privées ne sont pas autorisées pour un addon.".into());
    }
    Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .resolve_to_addrs(host, &addresses)
        .user_agent("Primio/0.1.0")
        .build()
        .map_err(|_| "Impossible d’initialiser le réseau".into())
}
pub async fn fetch_json(raw: &str) -> Result<Value, String> {
    let mut url = Url::parse(raw).map_err(|_| "URL invalide")?;
    for _ in 0..4 {
        let client = client_for(&url).await?;
        let mut response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|_| "Le fournisseur est indisponible.")?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or("Redirection invalide")?;
            url = url.join(location).map_err(|_| "Redirection invalide")?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!(
                "Le fournisseur répond HTTP {}.",
                response.status().as_u16()
            ));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "Réponse interrompue")? {
            if bytes.len() + chunk.len() > 5_000_000 {
                return Err("Réponse trop volumineuse".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        return serde_json::from_slice(&bytes).map_err(|_| "Réponse JSON invalide".into());
    }
    Err("Trop de redirections".into())
}
pub async fn api_request(
    path: &str,
    method: &str,
    body: Value,
    token: Option<String>,
) -> Result<Value, ApiError> {
    let err = |message: &str, status| ApiError {
        message: message.into(),
        status,
        data: Value::Null,
    };
    if ![
        "/auth/signup",
        "/auth/login",
        "/account/profile",
        "/account/logout",
        "/account/sync",
        "/account",
        "/app-release",
    ]
    .contains(&path)
    {
        return Err(err("Route invalide", 400));
    }
    let method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| err("Méthode invalide", 400))?;
    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| err("Réseau indisponible", 0))?;
    let mut request = client.request(method, format!("https://primio-api.azks.fr/api/v1{path}"));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    if !body.is_null() {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|_| err("Le compte est temporairement inaccessible.", 0))?;
    let status = response.status().as_u16();
    if status == 204 {
        return Ok(Value::Null);
    }
    let data: Value = response
        .json()
        .await
        .map_err(|_| err("Réponse serveur invalide", status))?;
    if status >= 400 {
        let message = data["errors"][0]["message"]
            .as_str()
            .or_else(|| data["message"].as_str())
            .unwrap_or("La requête a échoué.")
            .to_owned();
        return Err(ApiError {
            message,
            status,
            data,
        });
    }
    Ok(data)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blocks_private_networks() {
        for ip in [
            "127.0.0.1",
            "192.168.1.1",
            "10.0.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "::1",
            "::ffff:127.0.0.1",
            "fc00::1",
            "fe80::1",
        ] {
            assert!(!public_ip(ip.parse().unwrap()), "{ip}");
        }
        assert!(public_ip("1.1.1.1".parse().unwrap()));
    }
    #[test]
    fn media_protocols_are_bounded() {
        assert!(validate_media("file:///private").is_err());
        assert!(validate_media("https://user:pass@example.org").is_err());
        assert!(validate_media("https://example.org/film.m3u8").is_ok());
    }
}

pub async fn provider_request(operation: &str, body: Value) -> Result<Value, String> {
    let endpoint = match operation {
        "anilist" => "https://graphql.anilist.co",
        "stremioLogin" => "https://api.strem.io/api/login",
        "stremioAddons" => "https://api.strem.io/api/addonCollectionGet",
        "stremioLibrary" => "https://api.strem.io/api/datastoreGet",
        _ => return Err("Unknown import provider".into()),
    };
    if body.to_string().len() > 16384 {
        return Err("Import request too large".into());
    }
    if operation == "anilist"
        && !body["query"]
            .as_str()
            .unwrap_or("")
            .trim_start()
            .starts_with("query ")
    {
        return Err("Read-only queries required".into());
    }
    let url = Url::parse(endpoint).map_err(|_| "Invalid provider")?;
    let client = client_for(&url).await?;
    let mut response = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|_| "Import provider unavailable")?;
    if !response.status().is_success() {
        return Err(format!(
            "Import provider HTTP {}",
            response.status().as_u16()
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Import interrupted")? {
        if bytes.len() + chunk.len() > 5_000_000 {
            return Err("Import response too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid import response".into())
}
