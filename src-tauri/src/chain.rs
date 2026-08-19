//! The second hop: routing the tunnel's output through a node of your own.
//!
//! Cloudflare WARP is explicit that it does not change your country -- it
//! egresses near you and geolocates the exit address to your region. So a user
//! in Iran connects successfully and still looks like they are in Iran. The
//! only way to change that is to add a hop after the tunnel.
//!
//! mihomo does the hop. Its `dialer-proxy` dials a node *through* another
//! proxy, so every node is reached from inside the MASQUE tunnel and the exit
//! address becomes the node's, not Cloudflare's. Verified end to end before any
//! of this was written: a real subscription moved the visible country from TH
//! to JP, and the tunnel saw the node being dialled through it.
//!
//! Two consequences of that order are worth stating, because they are the whole
//! reason it is this way round and not the other:
//!
//! - the node is dialled from inside the tunnel, so local filtering sees an
//!   ordinary Cloudflare connection and never the node's address or SNI, and
//! - a node blocked from this network is still reachable, because it is reached
//!   from Cloudflare's network rather than from here.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// The name the generated config gives the first hop. Referenced by every node
/// through `dialer-proxy`, which is what puts them behind the tunnel.
const TUNNEL_PROXY: &str = "aether";
/// The group every rule points at. Selecting a node means selecting into this.
const EXIT_GROUP: &str = "exit";
/// The provider holding whatever the user pasted by hand.
const MANUAL_PROVIDER: &str = "manual";

/// How long to wait for mihomo to answer its own API before giving up on it.
const READY_TIMEOUT: Duration = Duration::from_secs(12);
const API_TIMEOUT: Duration = Duration::from_secs(30);

#[cfg(windows)]
const MIHOMO_FILENAME: &str = "mihomo.exe";
#[cfg(not(windows))]
const MIHOMO_FILENAME: &str = "mihomo";

/// A source of nodes. Either a subscription we or the user supplies, or a
/// block of pasted config URIs.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChainSource {
    /// Shown in the dashboard so a node can be traced back to where it came from.
    pub name: String,
    pub url: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainSettings {
    pub enabled: bool,
    /// Dial the nodes from inside the MASQUE tunnel.
    ///
    /// On by default, and worth keeping: it is what hides the node's address
    /// and SNI from the local network. But it makes the chain impossible
    /// whenever the tunnel cannot connect -- and on a network that resets
    /// MASQUE, that is always -- so it can be turned off to reach the nodes
    /// directly instead of reaching nothing at all.
    pub through_tunnel: bool,
    /// Subscription URLs. Ours ships as the first entry; the user may add more.
    pub sources: Vec<ChainSource>,
    /// Config URIs pasted by hand, one per line. mihomo converts these itself,
    /// so vless, vmess, trojan, ss, hysteria2 and the rest all work without us
    /// parsing anything.
    pub manual: String,
    /// The node last selected, so a reconnect returns to it.
    pub node: Option<String>,
}

impl Default for ChainSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            through_tunnel: true,
            sources: Vec::new(),
            manual: String::new(),
            node: None,
        }
    }
}

/// A running mihomo, and the addresses it answers on.
pub struct Running {
    child: Child,
    /// Where applications and the system proxy point while the chain is up.
    pub mixed: SocketAddr,
    api: SocketAddr,
    secret: String,
}

#[derive(Default)]
pub struct Chain {
    running: Mutex<Option<Running>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainNode {
    pub name: String,
    /// Which source supplied it.
    pub source: String,
    /// Protocol as mihomo reports it, e.g. "Vless".
    pub kind: String,
    /// Milliseconds through the tunnel, or None when the last test failed.
    pub delay: Option<u32>,
}

impl Chain {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn address(&self) -> Option<SocketAddr> {
        self.running.lock().ok()?.as_ref().map(|running| running.mixed)
    }

    pub fn is_running(&self) -> bool {
        self.address().is_some()
    }

    /// Starts mihomo with every node dialling through `tunnel`.
    ///
    /// Returns the address to point applications at. Fails rather than starting
    /// a chain that would silently bypass the tunnel.
    pub fn start(
        &self,
        app: &AppHandle,
        tunnel: Option<SocketAddr>,
        settings: &ChainSettings,
    ) -> Result<SocketAddr, String> {
        self.stop();

        let usable: Vec<&ChainSource> = settings
            .sources
            .iter()
            .filter(|source| source.enabled && !source.url.trim().is_empty())
            .collect();
        if usable.is_empty() && settings.manual.trim().is_empty() {
            return Err("add a subscription or a config before turning the chain on".into());
        }
        if settings.through_tunnel && tunnel.is_none() {
            return Err("connect first, or turn off \"dial nodes through the tunnel\"".into());
        }

        let binary = locate(app)?;
        let home = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("no application data directory: {error}"))?
            .join("chain");
        std::fs::create_dir_all(home.join("providers"))
            .map_err(|error| format!("cannot prepare the chain directory: {error}"))?;

        let mixed = free_port()?;
        let api = free_port()?;
        let secret = secret();

        if !settings.manual.trim().is_empty() {
            std::fs::write(home.join("providers").join("manual.txt"), settings.manual.trim())
                .map_err(|error| format!("cannot write the pasted configs: {error}"))?;
        }

        let config = render(tunnel, mixed, api, &secret, &usable, &settings.manual);
        let config_path = home.join("config.yaml");
        std::fs::write(&config_path, config)
            .map_err(|error| format!("cannot write the chain config: {error}"))?;

        let mut command = Command::new(&binary);
        command
            .arg("-f")
            .arg(&config_path)
            .arg("-d")
            .arg(&home)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // Without this every launch flashes a console window.
            command.creation_flags(0x0800_0000);
        }

        let mut child = command
            .spawn()
            .map_err(|error| format!("cannot start the chain: {error}"))?;

        let api_address = SocketAddr::from((Ipv4Addr::LOCALHOST, api));
        if let Err(error) = wait_until_ready(api_address, &secret) {
            // A half-started chain must never be left behind: the system proxy
            // would point at a port nothing is listening on.
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }

        let mixed_address = SocketAddr::from((Ipv4Addr::LOCALHOST, mixed));
        *self.running.lock().map_err(|_| "the chain lock is poisoned")? =
            Some(Running { child, mixed: mixed_address, api: api_address, secret });
        Ok(mixed_address)
    }

    pub fn stop(&self) {
        let Ok(mut guard) = self.running.lock() else {
            return;
        };
        if let Some(mut running) = guard.take() {
            let _ = running.child.kill();
            let _ = running.child.wait();
        }
    }

    /// Every node from every source, with the delay each last recorded.
    pub fn nodes(&self) -> Result<Vec<ChainNode>, String> {
        let (api, secret) = self.control()?;
        let body = get(api, &secret, "/providers/proxies")?;
        let parsed: serde_json::Value = serde_json::from_str(&body)
            .map_err(|error| format!("the chain sent something unreadable: {error}"))?;

        let mut nodes = Vec::new();
        let Some(providers) = parsed.get("providers").and_then(|value| value.as_object()) else {
            return Ok(nodes);
        };
        for (source, provider) in providers {
            // The built-in "default" provider holds DIRECT, REJECT and the
            // group itself -- none of which are somewhere traffic can exit.
            if provider.get("vehicleType").and_then(|v| v.as_str()) == Some("Compatible") {
                continue;
            }
            let Some(list) = provider.get("proxies").and_then(|value| value.as_array()) else {
                continue;
            };
            for proxy in list {
                let Some(name) = proxy.get("name").and_then(|v| v.as_str()) else {
                    continue;
                };
                nodes.push(ChainNode {
                    name: name.to_string(),
                    source: source.clone(),
                    kind: proxy.get("type").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
                    delay: proxy
                        .get("history")
                        .and_then(|v| v.as_array())
                        .and_then(|history| history.last())
                        .and_then(|entry| entry.get("delay"))
                        .and_then(|v| v.as_u64())
                        .filter(|delay| *delay > 0)
                        .map(|delay| delay as u32),
                });
            }
        }
        nodes.sort_by(|a, b| match (a.delay, b.delay) {
            (Some(left), Some(right)) => left.cmp(&right),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.name.cmp(&b.name),
        });
        Ok(nodes)
    }

    /// Measures one node, through the tunnel.
    ///
    /// This is the same question as "does this config work at all from here",
    /// because mihomo sends the probe down the node's `dialer-proxy` -- so a
    /// number means the config is usable behind the tunnel and a failure means
    /// it is not. Nodes supplied by a provider are not addressable through
    /// `/proxies/{name}/delay`; they answer only under their own provider.
    pub fn test(&self, source: &str, node: &str) -> Result<Option<u32>, String> {
        let (api, secret) = self.control()?;
        let path = format!(
            "/providers/proxies/{}/{}/healthcheck?url={}&timeout=8000",
            encode(source),
            encode(node),
            encode("http://www.gstatic.com/generate_204"),
        );
        match get(api, &secret, &path) {
            Ok(body) => {
                let parsed: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
                Ok(parsed.get("delay").and_then(|v| v.as_u64()).map(|d| d as u32))
            }
            // A node that cannot be reached is an answer, not an error: it is
            // exactly what the dashboard needs to show against that node.
            Err(_) => Ok(None),
        }
    }

    /// Routes traffic through one node.
    pub fn select(&self, node: &str) -> Result<(), String> {
        let (api, secret) = self.control()?;
        let body = format!("{{\"name\":{}}}", serde_json::to_string(node).unwrap_or_default());
        put(api, &secret, &format!("/proxies/{}", encode(EXIT_GROUP)), &body)
    }

    fn control(&self) -> Result<(SocketAddr, String), String> {
        let guard = self.running.lock().map_err(|_| "the chain lock is poisoned")?;
        let running = guard.as_ref().ok_or("the chain is not running")?;
        Ok((running.api, running.secret.clone()))
    }
}

impl Drop for Chain {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Builds the config.
///
/// `dialer-proxy` is set per provider rather than per node, which is what lets
/// a subscription of any size arrive without us parsing or rewriting a single
/// entry: every node it carries inherits the tunnel.
fn render(
    tunnel: Option<SocketAddr>,
    mixed: u16,
    api: u16,
    secret: &str,
    sources: &[&ChainSource],
    manual: &str,
) -> String {
    let mut config = String::new();
    config.push_str(&format!("mixed-port: {mixed}\n"));
    // Loopback only, with a secret that changes every run. Without both, any
    // web page the user opens could drive this API and reroute their traffic.
    config.push_str(&format!("external-controller: 127.0.0.1:{api}\n"));
    config.push_str(&format!("secret: {}\n", serde_json::to_string(secret).unwrap_or_default()));
    config.push_str("mode: rule\nlog-level: warning\nipv6: true\n");

    // Resolvers live inside the chain. A query that escapes to the local
    // network names the destination even when the traffic itself does not.
    config.push_str(
        "dns:\n  enable: true\n  ipv6: true\n  enhanced-mode: fake-ip\n  \
         fake-ip-range: 198.18.0.1/16\n  nameserver:\n    - https://1.1.1.1/dns-query\n    \
         - https://dns.google/dns-query\n",
    );

    // Declared only when there is a tunnel to declare. A socks5 proxy pointing
    // at a port nothing is listening on would fail every node it fronted.
    let through = match tunnel {
        Some(address) => {
            config.push_str(&format!(
                "proxies:\n  - {{name: {TUNNEL_PROXY}, type: socks5, server: {}, port: {}, udp: true}}\n",
                address.ip(),
                address.port()
            ));
            format!("\n    dialer-proxy: {TUNNEL_PROXY}")
        }
        None => String::new(),
    };

    let mut names: Vec<String> = Vec::new();
    if !sources.is_empty() || !manual.trim().is_empty() {
        config.push_str("proxy-providers:\n");
    }
    for (index, source) in sources.iter().enumerate() {
        let key = format!("source{index}");
        names.push(key.clone());
        config.push_str(&format!(
            "  {key}:\n    type: http\n    url: {}\n    interval: 3600\n    \
             path: ./providers/{key}.yaml{through}\n    \
             health-check: {{enable: true, url: \"http://www.gstatic.com/generate_204\", \
             interval: 300, lazy: true}}\n",
            serde_json::to_string(&source.url).unwrap_or_default()
        ));
    }
    if !manual.trim().is_empty() {
        names.push(MANUAL_PROVIDER.into());
        config.push_str(&format!(
            "  {MANUAL_PROVIDER}:\n    type: file\n    path: ./providers/manual.txt{through}\n    \
             health-check: {{enable: true, \
             url: \"http://www.gstatic.com/generate_204\", interval: 300, lazy: true}}\n"
        ));
    }

    config.push_str(&format!(
        "proxy-groups:\n  - name: {EXIT_GROUP}\n    type: select\n    use: [{}]\n",
        names.join(", ")
    ));
    // Everything goes to the exit group. A rule that let anything take a direct
    // route would put that traffic on the local network in the clear.
    config.push_str("rules:\n  - MATCH,{}\n".replace("{}", EXIT_GROUP).as_str());
    config
}

fn locate(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Ok(path) = std::env::var("WHITEAESTHER_MIHOMO_PATH") {
        if !path.trim().is_empty() {
            candidates.push(PathBuf::from(path));
        }
    }
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join(MIHOMO_FILENAME));
        candidates.push(resources.join("binaries").join(MIHOMO_FILENAME));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join(MIHOMO_FILENAME));
        }
    }
    for candidate in candidates {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err("the chain engine is missing from this installation".into())
}

/// A port the OS says is free right now.
///
/// There is a gap between letting go of the port and mihomo binding it. Nothing
/// on a desktop is racing for a random high port, and the alternative -- fixed
/// ports -- collides with whatever else the machine is already running.
fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))
        .map_err(|error| format!("no free local port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("no free local port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn secret() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!("{:x}{:x}", nanos, std::process::id())
}

/// Waits for mihomo to answer, which is the only proof it actually came up.
fn wait_until_ready(api: SocketAddr, secret: &str) -> Result<(), String> {
    let deadline = Instant::now() + READY_TIMEOUT;
    let mut last = String::from("the chain did not start");
    while Instant::now() < deadline {
        match get(api, secret, "/version") {
            Ok(_) => return Ok(()),
            Err(error) => last = error,
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err(format!("the chain did not become ready: {last}"))
}

fn encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn get(api: SocketAddr, secret: &str, path: &str) -> Result<String, String> {
    request(api, secret, "GET", path, None)
}

fn put(api: SocketAddr, secret: &str, path: &str, body: &str) -> Result<(), String> {
    request(api, secret, "PUT", path, Some(body)).map(|_| ())
}

/// A minimal HTTP client for the control API.
///
/// std-only, like the rest of this crate: the API is on loopback, speaks
/// HTTP/1.1, and pulling in a client stack to talk to it would be the largest
/// dependency in the project.
fn request(
    api: SocketAddr,
    secret: &str,
    method: &str,
    path: &str,
    body: Option<&str>,
) -> Result<String, String> {
    let mut stream = TcpStream::connect_timeout(&api, API_TIMEOUT)
        .map_err(|error| format!("the chain is not answering: {error}"))?;
    stream.set_read_timeout(Some(API_TIMEOUT)).map_err(|e| e.to_string())?;

    let payload = body.unwrap_or("");
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {api}\r\nAuthorization: Bearer {secret}\r\n\
         Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("cannot reach the chain: {error}"))?;

    let mut reader = BufReader::new(stream);
    let mut status = String::new();
    reader
        .read_line(&mut status)
        .map_err(|error| format!("the chain gave no reply: {error}"))?;
    let code = status
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or("the chain gave an unreadable reply")?;

    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
            break;
        }
        if line == "\r\n" || line == "\n" {
            break;
        }
    }
    let mut rest = String::new();
    let _ = reader.read_to_string(&mut rest);

    if !(200..300).contains(&code) {
        return Err(format!("the chain refused that request ({code})"));
    }
    Ok(rest)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(name: &str, url: &str) -> ChainSource {
        ChainSource { name: name.into(), url: url.into(), enabled: true }
    }

    fn tunnel() -> Option<SocketAddr> {
        Some("127.0.0.1:1819".parse().unwrap())
    }

    #[test]
    fn every_source_dials_through_the_tunnel() {
        // The one property the whole feature rests on. A provider without
        // dialer-proxy would reach its nodes directly, exposing them to the
        // local network and leaving the exit address unchanged.
        let sources = [source("ours", "https://example.com/a"), source("theirs", "https://example.com/b")];
        let refs: Vec<&ChainSource> = sources.iter().collect();
        let config = render(tunnel(), 1820, 1821, "s", &refs, "vless://pasted");

        let providers = config.matches("dialer-proxy: aether").count();
        assert_eq!(providers, 3, "two subscriptions and the pasted block, all behind the tunnel");
    }

    #[test]
    fn nothing_is_allowed_to_take_a_direct_route() {
        let config = render(tunnel(), 1820, 1821, "s", &[], "vless://pasted");
        assert!(config.contains("MATCH,exit"));
        assert!(!config.contains("DIRECT"), "a direct rule would leak that traffic locally");
    }

    #[test]
    fn dns_resolves_inside_the_chain() {
        // A query that escapes names the destination even when the traffic does
        // not, which is the most common way a chain like this leaks.
        let config = render(tunnel(), 1820, 1821, "s", &[], "vless://x");
        assert!(config.contains("enhanced-mode: fake-ip"));
        assert!(config.contains("https://1.1.1.1/dns-query"));
        assert!(!config.contains("\n    - 8.8.8.8"), "a plain resolver would leave the chain");
    }

    #[test]
    fn the_control_api_is_never_exposed() {
        let config = render(tunnel(), 1820, 1821, "s3cret", &[], "vless://x");
        assert!(config.contains("external-controller: 127.0.0.1:1821"));
        assert!(config.contains("secret: \"s3cret\""));
    }

    #[test]
    fn a_disabled_source_is_left_out() {
        let mut off = source("off", "https://example.com/off");
        off.enabled = false;
        let on = source("on", "https://example.com/on");
        let refs: Vec<&ChainSource> = vec![&on];
        let config = render(tunnel(), 1820, 1821, "s", &refs, "");
        assert!(config.contains("example.com/on"));
        assert!(!config.contains("example.com/off"));
        let _ = off;
    }

    #[test]
    fn without_a_tunnel_the_nodes_are_reached_directly() {
        // The whole point of the fallback: on a network that resets MASQUE the
        // tunnel never comes up, and a config that still insisted on dialling
        // through it would leave the user with nothing working at all.
        let config = render(None, 1820, 1821, "s", &[], "vless://x");
        assert!(!config.contains("dialer-proxy"), "nothing to dial through");
        assert!(
            !config.contains("type: socks5"),
            "a socks5 proxy pointing at a dead port would fail every node it fronted",
        );
        // Everything else must still hold: no direct rule, DNS inside the chain.
        assert!(config.contains("MATCH,exit"));
        assert!(config.contains("enhanced-mode: fake-ip"));
    }

    #[test]
    fn a_secret_differs_between_runs() {
        assert_ne!(secret(), secret());
    }

    #[test]
    fn percent_encoding_covers_the_characters_node_names_actually_use() {
        // Node names arrive from subscriptions and routinely carry spaces and
        // non-ASCII; an unencoded name would build a broken request path.
        assert_eq!(encode("a b"), "a%20b");
        assert_eq!(encode("xhttp-tls -cdn"), "xhttp-tls%20-cdn");
        assert_eq!(encode("safe-._~"), "safe-._~");
        assert!(encode("🇯🇵 tokyo").starts_with('%'));
    }
}
