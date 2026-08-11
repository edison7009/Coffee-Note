use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const DEFAULT_FIRECRAWL_URL: &str = "https://api.firecrawl.dev";
const DEFAULT_JINA_URL: &str = "https://r.jina.ai";
const READER_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_READER_RESPONSE_BYTES: usize = 900_000;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebReaderSettings {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
}

impl Default for WebReaderSettings {
    fn default() -> Self {
        Self {
            provider: "direct".to_string(),
            base_url: String::new(),
            api_key: String::new(),
        }
    }
}

impl WebReaderSettings {
    pub fn normalized(&self) -> Self {
        let provider = match self.provider.trim().to_ascii_lowercase().as_str() {
            "firecrawl" => "firecrawl",
            "jina" => "jina",
            _ => "direct",
        };
        let default_url = match provider {
            "firecrawl" => DEFAULT_FIRECRAWL_URL,
            "jina" => DEFAULT_JINA_URL,
            _ => "",
        };
        Self {
            provider: provider.to_string(),
            base_url: if self.base_url.trim().is_empty() {
                default_url.to_string()
            } else {
                self.base_url.trim().trim_end_matches('/').to_string()
            },
            api_key: self.api_key.trim().to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebReaderPage {
    pub title: String,
    pub content: String,
    pub source_url: String,
    pub provider: String,
}

#[derive(Debug, Deserialize)]
struct FirecrawlResponse {
    success: Option<bool>,
    error: Option<String>,
    data: Option<FirecrawlData>,
}

#[derive(Debug, Deserialize)]
struct FirecrawlData {
    markdown: Option<String>,
    metadata: Option<FirecrawlMetadata>,
}

#[derive(Debug, Deserialize)]
struct FirecrawlMetadata {
    title: Option<serde_json::Value>,
    #[serde(rename = "sourceURL")]
    source_url: Option<String>,
}

pub async fn read_url(url: &Url, settings: &WebReaderSettings) -> Result<WebReaderPage, String> {
    super::validate_public_url(url)?;
    let normalized = settings.normalized();
    let primary = match normalized.provider.as_str() {
        "firecrawl" => fetch_firecrawl(url, &normalized).await,
        "jina" => fetch_jina(url, &normalized).await,
        _ => fetch_direct(url).await,
    };

    match primary {
        Ok(page) => Ok(page),
        Err(primary_error) if normalized.provider != "direct" => match fetch_direct(url).await {
            Ok(mut page) => {
                page.provider = format!("{}+direct-fallback", normalized.provider);
                Ok(page)
            }
            Err(fallback_error) => Err(format!(
                "{} reader failed: {}; direct fallback failed: {}",
                normalized.provider, primary_error, fallback_error
            )),
        },
        Err(error) => Err(error),
    }
}

async fn fetch_direct(url: &Url) -> Result<WebReaderPage, String> {
    let content = super::fetch_capture_source(url).await?;
    Ok(WebReaderPage {
        title: url.host_str().unwrap_or("Web source").to_string(),
        content,
        source_url: url.to_string(),
        provider: "direct".to_string(),
    })
}

fn provider_endpoint(settings: &WebReaderSettings, suffix: &str) -> Result<Url, String> {
    let base = settings.base_url.trim().trim_end_matches('/');
    let parsed = Url::parse(base).map_err(|_| "Web reader API URL is invalid".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("Web reader API URL must use HTTP or HTTPS and include a host".to_string());
    }
    if base.ends_with(suffix) {
        Ok(parsed)
    } else {
        Url::parse(&format!("{base}{suffix}"))
            .map_err(|_| "Web reader API URL is invalid".to_string())
    }
}

async fn fetch_firecrawl(url: &Url, settings: &WebReaderSettings) -> Result<WebReaderPage, String> {
    let endpoint = provider_endpoint(settings, "/v2/scrape")?;
    let client = reqwest::Client::builder()
        .timeout(READER_TIMEOUT)
        .build()
        .map_err(|error| format!("Could not create Firecrawl client: {error}"))?;
    let mut request = client.post(endpoint).json(&serde_json::json!({
        "url": url,
        "formats": ["markdown"]
    }));
    if !settings.api_key.is_empty() {
        request = request.bearer_auth(&settings.api_key);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Could not reach Firecrawl: {error}"))?;
    let status = response.status();
    let body = read_bounded_body(response).await?;
    if !status.is_success() {
        return Err(format!("Firecrawl returned HTTP {status}"));
    }
    let payload: FirecrawlResponse = serde_json::from_slice(&body)
        .map_err(|error| format!("Firecrawl returned invalid JSON: {error}"))?;
    if payload.success == Some(false) {
        return Err(payload
            .error
            .unwrap_or_else(|| "Firecrawl rejected the URL".to_string()));
    }
    let data = payload
        .data
        .ok_or_else(|| "Firecrawl returned no page data".to_string())?;
    let content = data
        .markdown
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Firecrawl returned empty page content".to_string())?;
    let metadata = data.metadata;
    let title = metadata
        .as_ref()
        .and_then(|value| value.title.as_ref())
        .and_then(|value| {
            value
                .as_str()
                .or_else(|| value.as_array()?.first()?.as_str())
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| url.host_str().unwrap_or("Web source"))
        .to_string();
    let source_url = metadata
        .and_then(|value| value.source_url)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| url.to_string());
    Ok(WebReaderPage {
        title,
        content: super::truncate_utf8(&content, super::MAX_CAPTURE_SOURCE_BYTES),
        source_url,
        provider: "firecrawl".to_string(),
    })
}

async fn fetch_jina(url: &Url, settings: &WebReaderSettings) -> Result<WebReaderPage, String> {
    let base = settings.base_url.trim().trim_end_matches('/');
    let endpoint = Url::parse(&format!("{base}/{}", url.as_str()))
        .map_err(|_| "Jina Reader API URL is invalid".to_string())?;
    if !matches!(endpoint.scheme(), "http" | "https") || endpoint.host_str().is_none() {
        return Err("Jina Reader API URL must use HTTP or HTTPS and include a host".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(READER_TIMEOUT)
        .build()
        .map_err(|error| format!("Could not create Jina Reader client: {error}"))?;
    let mut request = client.get(endpoint);
    if !settings.api_key.is_empty() {
        request = request.bearer_auth(&settings.api_key);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Could not reach Jina Reader: {error}"))?;
    let status = response.status();
    let body = read_bounded_body(response).await?;
    if !status.is_success() {
        return Err(format!("Jina Reader returned HTTP {status}"));
    }
    let content = String::from_utf8_lossy(&body).trim().to_string();
    if content.is_empty() {
        return Err("Jina Reader returned empty page content".to_string());
    }
    Ok(WebReaderPage {
        title: url.host_str().unwrap_or("Web source").to_string(),
        content: super::truncate_utf8(&content, super::MAX_CAPTURE_SOURCE_BYTES),
        source_url: url.to_string(),
        provider: "jina".to_string(),
    })
}

async fn read_bounded_body(mut response: reqwest::Response) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_READER_RESPONSE_BYTES as u64)
    {
        return Err("The web reader response is too large".to_string());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Could not finish reading the web reader response: {error}"))?
    {
        if body.len() + chunk.len() > MAX_READER_RESPONSE_BYTES {
            return Err("The web reader response is too large".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_reader_provider_defaults() {
        let firecrawl = WebReaderSettings {
            provider: "firecrawl".into(),
            ..Default::default()
        }
        .normalized();
        assert_eq!(firecrawl.base_url, DEFAULT_FIRECRAWL_URL);

        let direct = WebReaderSettings {
            provider: "unknown".into(),
            base_url: "  ".into(),
            api_key: " key ".into(),
        }
        .normalized();
        assert_eq!(direct.provider, "direct");
        assert_eq!(direct.api_key, "key");
    }

    #[test]
    fn builds_firecrawl_endpoint_without_duplicate_suffix() {
        let settings = WebReaderSettings {
            provider: "firecrawl".into(),
            base_url: "https://reader.example/v2/scrape".into(),
            ..Default::default()
        };
        assert_eq!(
            provider_endpoint(&settings, "/v2/scrape").unwrap().as_str(),
            "https://reader.example/v2/scrape"
        );
    }
}
