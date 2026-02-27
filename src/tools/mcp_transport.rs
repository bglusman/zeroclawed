//! MCP transport abstraction — supports stdio, SSE, and HTTP transports.

use std::borrow::Cow;

use anyhow::{anyhow, bail, Context, Result};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::{timeout, Duration};

use crate::config::schema::{McpServerConfig, McpTransport};
use crate::tools::mcp_protocol::{JsonRpcRequest, JsonRpcResponse};

/// Maximum bytes for a single JSON-RPC response.
const MAX_LINE_BYTES: usize = 4 * 1024 * 1024; // 4 MB

/// Timeout for init/list operations.
const RECV_TIMEOUT_SECS: u64 = 30;

// ── Transport Trait ──────────────────────────────────────────────────────

/// Abstract transport for MCP communication.
#[async_trait::async_trait]
pub trait McpTransportConn: Send + Sync {
    /// Send a JSON-RPC request and receive the response.
    async fn send_and_recv(&mut self, request: &JsonRpcRequest) -> Result<JsonRpcResponse>;

    /// Close the connection.
    async fn close(&mut self) -> Result<()>;
}

// ── Stdio Transport ──────────────────────────────────────────────────────

/// Stdio-based transport (spawn local process).
pub struct StdioTransport {
    _child: Child,
    stdin: tokio::process::ChildStdin,
    stdout_lines: tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
}

impl StdioTransport {
    pub fn new(config: &McpServerConfig) -> Result<Self> {
        let mut child = Command::new(&config.command)
            .args(&config.args)
            .envs(&config.env)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("failed to spawn MCP server `{}`", config.name))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow!("no stdin on MCP server `{}`", config.name))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("no stdout on MCP server `{}`", config.name))?;
        let stdout_lines = BufReader::new(stdout).lines();

        Ok(Self {
            _child: child,
            stdin,
            stdout_lines,
        })
    }

    async fn send_raw(&mut self, line: &str) -> Result<()> {
        self.stdin
            .write_all(line.as_bytes())
            .await
            .context("failed to write to MCP server stdin")?;
        self.stdin
            .write_all(b"\n")
            .await
            .context("failed to write newline to MCP server stdin")?;
        self.stdin.flush().await.context("failed to flush stdin")?;
        Ok(())
    }

    async fn recv_raw(&mut self) -> Result<String> {
        let line = self
            .stdout_lines
            .next_line()
            .await?
            .ok_or_else(|| anyhow!("MCP server closed stdout"))?;
        if line.len() > MAX_LINE_BYTES {
            bail!("MCP response too large: {} bytes", line.len());
        }
        Ok(line)
    }
}

#[async_trait::async_trait]
impl McpTransportConn for StdioTransport {
    async fn send_and_recv(&mut self, request: &JsonRpcRequest) -> Result<JsonRpcResponse> {
        let line = serde_json::to_string(request)?;
        self.send_raw(&line).await?;
        let resp_line = timeout(Duration::from_secs(RECV_TIMEOUT_SECS), self.recv_raw())
            .await
            .context("timeout waiting for MCP response")??;
        let resp: JsonRpcResponse = serde_json::from_str(&resp_line)
            .with_context(|| format!("invalid JSON-RPC response: {}", resp_line))?;
        Ok(resp)
    }

    async fn close(&mut self) -> Result<()> {
        let _ = self.stdin.shutdown().await;
        Ok(())
    }
}

// ── HTTP Transport ───────────────────────────────────────────────────────

/// HTTP-based transport (POST requests).
pub struct HttpTransport {
    url: String,
    client: reqwest::Client,
    headers: std::collections::HashMap<String, String>,
}

impl HttpTransport {
    pub fn new(config: &McpServerConfig) -> Result<Self> {
        let url = config
            .url
            .as_ref()
            .ok_or_else(|| anyhow!("URL required for HTTP transport"))?
            .clone();

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .context("failed to build HTTP client")?;

        Ok(Self {
            url,
            client,
            headers: config.headers.clone(),
        })
    }
}

#[async_trait::async_trait]
impl McpTransportConn for HttpTransport {
    async fn send_and_recv(&mut self, request: &JsonRpcRequest) -> Result<JsonRpcResponse> {
        let body = serde_json::to_string(request)?;

        let mut req = self.client.post(&self.url).body(body);
        for (key, value) in &self.headers {
            req = req.header(key, value);
        }

        let resp = req
            .send()
            .await
            .context("HTTP request to MCP server failed")?;

        if !resp.status().is_success() {
            bail!("MCP server returned HTTP {}", resp.status());
        }

        let resp_text = resp.text().await.context("failed to read HTTP response")?;
        let mcp_resp: JsonRpcResponse = serde_json::from_str(&resp_text)
            .with_context(|| format!("invalid JSON-RPC response: {}", resp_text))?;

        Ok(mcp_resp)
    }

    async fn close(&mut self) -> Result<()> {
        Ok(())
    }
}

// ── SSE Transport ─────────────────────────────────────────────────────────

/// SSE-based transport (HTTP POST for requests, SSE for responses).
pub struct SseTransport {
    base_url: String,
    client: reqwest::Client,
    headers: std::collections::HashMap<String, String>,
    #[allow(dead_code)]
    event_source: Option<tokio::task::JoinHandle<()>>,
}

impl SseTransport {
    pub fn new(config: &McpServerConfig) -> Result<Self> {
        let base_url = config
            .url
            .as_ref()
            .ok_or_else(|| anyhow!("URL required for SSE transport"))?
            .clone();

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .context("failed to build HTTP client")?;

        Ok(Self {
            base_url,
            client,
            headers: config.headers.clone(),
            event_source: None,
        })
    }
}

fn extract_json_from_sse_text(resp_text: &str) -> Cow<'_, str> {
    let text = resp_text.trim_start_matches('\u{feff}');
    let mut current_data_lines: Vec<&str> = Vec::new();
    let mut last_event_data_lines: Vec<&str> = Vec::new();

    for raw_line in text.lines() {
        let line = raw_line.trim_end_matches('\r').trim_start();
        if line.is_empty() {
            if !current_data_lines.is_empty() {
                last_event_data_lines = std::mem::take(&mut current_data_lines);
            }
            continue;
        }

        if line.starts_with(':') {
            continue;
        }

        if let Some(rest) = line.strip_prefix("data:") {
            let rest = rest.strip_prefix(' ').unwrap_or(rest);
            current_data_lines.push(rest);
        }
    }

    if !current_data_lines.is_empty() {
        last_event_data_lines = current_data_lines;
    }

    if last_event_data_lines.is_empty() {
        return Cow::Borrowed(text.trim());
    }

    if last_event_data_lines.len() == 1 {
        return Cow::Borrowed(last_event_data_lines[0].trim());
    }

    let joined = last_event_data_lines.join("\n");
    Cow::Owned(joined.trim().to_string())
}

#[async_trait::async_trait]
impl McpTransportConn for SseTransport {
    async fn send_and_recv(&mut self, request: &JsonRpcRequest) -> Result<JsonRpcResponse> {
        let body = serde_json::to_string(request)?;
        let url = format!("{}/message", self.base_url.trim_end_matches('/'));

        let mut req = self
            .client
            .post(&url)
            .body(body)
            .header("Content-Type", "application/json");
        for (key, value) in &self.headers {
            req = req.header(key, value);
        }
        if !self.headers.keys().any(|k| k.eq_ignore_ascii_case("Accept")) {
            req = req.header("Accept", "text/event-stream");
        }

        let resp = req.send().await.context("SSE POST to MCP server failed")?;

        if !resp.status().is_success() {
            bail!("MCP server returned HTTP {}", resp.status());
        }

        let resp_text = resp.text().await.context("failed to read SSE response")?;
        let json_str = extract_json_from_sse_text(&resp_text);
        let mcp_resp: JsonRpcResponse = serde_json::from_str(json_str.as_ref())
            .with_context(|| format!("invalid JSON-RPC response: {}", resp_text))?;

        Ok(mcp_resp)
    }

    async fn close(&mut self) -> Result<()> {
        Ok(())
    }
}

// ── Factory ──────────────────────────────────────────────────────────────

/// Create a transport based on config.
pub fn create_transport(config: &McpServerConfig) -> Result<Box<dyn McpTransportConn>> {
    match config.transport {
        McpTransport::Stdio => Ok(Box::new(StdioTransport::new(config)?)),
        McpTransport::Http => Ok(Box::new(HttpTransport::new(config)?)),
        McpTransport::Sse => Ok(Box::new(SseTransport::new(config)?)),
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transport_default_is_stdio() {
        let config = McpServerConfig::default();
        assert_eq!(config.transport, McpTransport::Stdio);
    }

    #[test]
    fn test_http_transport_requires_url() {
        let config = McpServerConfig {
            name: "test".into(),
            transport: McpTransport::Http,
            ..Default::default()
        };
        assert!(HttpTransport::new(&config).is_err());
    }

    #[test]
    fn test_sse_transport_requires_url() {
        let config = McpServerConfig {
            name: "test".into(),
            transport: McpTransport::Sse,
            ..Default::default()
        };
        assert!(SseTransport::new(&config).is_err());
    }

    #[test]
    fn test_extract_json_from_sse_data_no_space() {
        let input = "data:{\"jsonrpc\":\"2.0\",\"result\":{}}\n\n";
        let extracted = extract_json_from_sse_text(input);
        let _: JsonRpcResponse = serde_json::from_str(extracted.as_ref()).unwrap();
    }

    #[test]
    fn test_extract_json_from_sse_with_event_and_id() {
        let input = "id: 1\nevent: message\ndata: {\"jsonrpc\":\"2.0\",\"result\":{}}\n\n";
        let extracted = extract_json_from_sse_text(input);
        let _: JsonRpcResponse = serde_json::from_str(extracted.as_ref()).unwrap();
    }

    #[test]
    fn test_extract_json_from_sse_multiline_data() {
        let input = "event: message\ndata: {\ndata:   \"jsonrpc\": \"2.0\",\ndata:   \"result\": {}\ndata: }\n\n";
        let extracted = extract_json_from_sse_text(input);
        let _: JsonRpcResponse = serde_json::from_str(extracted.as_ref()).unwrap();
    }

    #[test]
    fn test_extract_json_from_sse_skips_bom_and_leading_whitespace() {
        let input = "\u{feff}\n\n  data: {\"jsonrpc\":\"2.0\",\"result\":{}}\n\n";
        let extracted = extract_json_from_sse_text(input);
        let _: JsonRpcResponse = serde_json::from_str(extracted.as_ref()).unwrap();
    }

    #[test]
    fn test_extract_json_from_sse_uses_last_event_with_data() {
        let input = ": keep-alive\n\nid: 1\nevent: message\ndata: {\"jsonrpc\":\"2.0\",\"result\":{}}\n\n";
        let extracted = extract_json_from_sse_text(input);
        let _: JsonRpcResponse = serde_json::from_str(extracted.as_ref()).unwrap();
    }
}
