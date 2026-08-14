//! Points the operating system's proxy settings at the SOCKS5 listener.
//!
//! The core already exposes a working SOCKS5 endpoint; without this, using it
//! means configuring every application by hand. The whole problem here is
//! putting the setting back: a proxy pointing at a listener that no longer
//! exists takes the machine off the network, and the user will not connect that
//! to an app that is no longer running. So the previous value is written to disk
//! *before* anything changes, and [`recover`] restores it on the next launch if
//! the process died before it could.

use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const BACKUP_FILE: &str = "system-proxy-backup.json";

/// The settings as they were before this app touched them.
///
/// Tagged and versioned because it is read by a later run of a possibly newer
/// build: a backup it cannot understand must fail loudly rather than restore
/// something invented.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "platform", rename_all = "camelCase")]
pub enum ProxyBackup {
    #[serde(rename_all = "camelCase")]
    Windows {
        enabled: bool,
        server: String,
        bypass: String,
    },
    #[serde(rename_all = "camelCase")]
    Macos { services: Vec<MacProxyService> },
    #[serde(rename_all = "camelCase")]
    Gnome {
        mode: String,
        host: String,
        port: i64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MacProxyService {
    pub name: String,
    pub enabled: bool,
    pub host: String,
    pub port: u16,
}

/// Where each platform should be pointed.
///
/// macOS and GNOME speak SOCKS5 and are given the core's listener directly.
/// Windows is given the local HTTP bridge instead: WinINET's SOCKS is version 4
/// and Chrome and Edge ignore the `socks=` key entirely, so pointing it at a
/// SOCKS5 listener sets a value almost nothing obeys.
#[derive(Debug, Clone, Copy)]
pub struct ProxyTargets {
    pub socks: SocketAddr,
    pub http: SocketAddr,
}

fn backup_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(BACKUP_FILE))
        .map_err(|error| format!("cannot resolve app config directory: {error}"))
}

pub fn is_applied(app: &AppHandle) -> bool {
    backup_path(app).map(|path| path.exists()).unwrap_or(false)
}

/// Routes the system proxy through `socks`, remembering what was there before.
///
/// Re-applying while already applied deliberately does not touch the backup --
/// capturing our own settings as "the previous value" is how a tool like this
/// makes a proxy permanent.
pub fn apply(app: &AppHandle, targets: ProxyTargets) -> Result<(), String> {
    let path = backup_path(app)?;
    if !path.exists() {
        let current = platform::read()?;
        let bytes = serde_json::to_vec_pretty(&current)
            .map_err(|error| format!("cannot record the current proxy settings: {error}"))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("cannot create app config directory: {error}"))?;
        }
        // Written and flushed before anything changes, so a crash one
        // instruction later still leaves something to restore from.
        std::fs::write(&path, bytes)
            .map_err(|error| format!("cannot save the current proxy settings: {error}"))?;
    }
    platform::apply(targets)
}

/// Puts the settings back and forgets the backup.
pub fn revert(app: &AppHandle) -> Result<(), String> {
    let path = backup_path(app)?;
    if !path.exists() {
        return Ok(());
    }
    let bytes =
        std::fs::read(&path).map_err(|error| format!("cannot read the proxy backup: {error}"))?;
    let backup: ProxyBackup = serde_json::from_slice(&bytes)
        .map_err(|error| format!("the proxy backup is unreadable: {error}"))?;
    platform::restore(&backup)?;
    // Only after a successful restore. A backup removed on a failed restore
    // would leave the machine proxied with nothing recording the way back.
    std::fs::remove_file(&path)
        .map_err(|error| format!("cannot clear the proxy backup: {error}"))?;
    Ok(())
}

/// Restores settings left behind by a run that did not exit cleanly.
///
/// Returns whether anything was restored. Errors are returned rather than
/// swallowed so startup can say so -- silently failing here is what leaves
/// someone with no network and no idea why.
pub fn recover(app: &AppHandle) -> Result<bool, String> {
    if !is_applied(app) {
        return Ok(false);
    }
    revert(app).map(|()| true)
}

#[cfg(target_os = "windows")]
mod platform {
    use super::ProxyBackup;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    const SETTINGS: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

    fn settings_key(access: u32) -> Result<RegKey, String> {
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags(SETTINGS, access)
            .map_err(|error| format!("cannot open the Internet Settings key: {error}"))
    }

    pub fn read() -> Result<ProxyBackup, String> {
        let key = settings_key(KEY_READ)?;
        Ok(ProxyBackup::Windows {
            enabled: key.get_value::<u32, _>("ProxyEnable").unwrap_or(0) != 0,
            server: key.get_value("ProxyServer").unwrap_or_default(),
            bypass: key.get_value("ProxyOverride").unwrap_or_default(),
        })
    }

    pub fn apply(targets: super::ProxyTargets) -> Result<(), String> {
        let key = settings_key(KEY_READ | KEY_WRITE)?;
        write(
            &key,
            1_u32,
            &super::windows_proxy_server(targets.http),
            super::WINDOWS_BYPASS,
        )?;
        notify();
        Ok(())
    }

    pub fn restore(backup: &ProxyBackup) -> Result<(), String> {
        let ProxyBackup::Windows {
            enabled,
            server,
            bypass,
        } = backup
        else {
            return Err("the saved proxy settings are not for Windows".into());
        };
        let key = settings_key(KEY_READ | KEY_WRITE)?;
        write(&key, u32::from(*enabled), server, bypass)?;
        notify();
        Ok(())
    }

    fn write(key: &RegKey, enabled: u32, server: &str, bypass: &str) -> Result<(), String> {
        key.set_value("ProxyEnable", &enabled)
            .and_then(|()| key.set_value("ProxyServer", &server.to_string()))
            .and_then(|()| key.set_value("ProxyOverride", &bypass.to_string()))
            .map_err(|error| format!("cannot write the proxy settings: {error}"))
    }

    /// WinINET caches these; without the broadcast, already-running programs
    /// keep using the old settings until they are restarted.
    fn notify() {
        use windows_sys::Win32::Networking::WinInet::{
            InternetSetOptionW, INTERNET_OPTION_REFRESH, INTERNET_OPTION_SETTINGS_CHANGED,
        };
        unsafe {
            InternetSetOptionW(
                std::ptr::null_mut(),
                INTERNET_OPTION_SETTINGS_CHANGED,
                std::ptr::null_mut(),
                0,
            );
            InternetSetOptionW(
                std::ptr::null_mut(),
                INTERNET_OPTION_REFRESH,
                std::ptr::null_mut(),
                0,
            );
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{MacProxyService, ProxyBackup};
    use std::process::Command;

    pub fn read() -> Result<ProxyBackup, String> {
        let mut services = Vec::new();
        for name in list_services()? {
            let output = networksetup(&["-getsocksfirewallproxy", &name])?;
            services.push(super::parse_mac_proxy(&name, &output));
        }
        if services.is_empty() {
            return Err("no configurable network services were found".into());
        }
        Ok(ProxyBackup::Macos { services })
    }

    pub fn apply(targets: super::ProxyTargets) -> Result<(), String> {
        for name in list_services()? {
            let port = targets.socks.port().to_string();
            let host = targets.socks.ip().to_string();
            networksetup(&["-setsocksfirewallproxy", &name, &host, &port])?;
            networksetup(&["-setsocksfirewallproxystate", &name, "on"])?;
        }
        Ok(())
    }

    pub fn restore(backup: &ProxyBackup) -> Result<(), String> {
        let ProxyBackup::Macos { services } = backup else {
            return Err("the saved proxy settings are not for macOS".into());
        };
        for service in services {
            // A service present at backup time can be gone now (an unplugged
            // adapter). Restoring the rest matters more than failing on it.
            let host = if service.host.is_empty() {
                "".to_string()
            } else {
                service.host.clone()
            };
            let port = service.port.to_string();
            let _ = networksetup(&["-setsocksfirewallproxy", &service.name, &host, &port]);
            let _ = networksetup(&[
                "-setsocksfirewallproxystate",
                &service.name,
                if service.enabled { "on" } else { "off" },
            ]);
        }
        Ok(())
    }

    fn list_services() -> Result<Vec<String>, String> {
        Ok(super::parse_mac_services(&networksetup(&[
            "-listallnetworkservices",
        ])?))
    }

    fn networksetup(args: &[&str]) -> Result<String, String> {
        let output = Command::new("/usr/sbin/networksetup")
            .args(args)
            .output()
            .map_err(|error| format!("cannot run networksetup: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "networksetup failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    use super::ProxyBackup;
    use std::process::Command;

    const SCHEMA: &str = "org.gnome.system.proxy";

    pub fn read() -> Result<ProxyBackup, String> {
        Ok(ProxyBackup::Gnome {
            mode: super::unquote_gsettings(&gsettings(&["get", SCHEMA, "mode"])?),
            host: super::unquote_gsettings(&gsettings(&["get", &socks_schema(), "host"])?),
            port: super::unquote_gsettings(&gsettings(&["get", &socks_schema(), "port"])?)
                .parse()
                .unwrap_or(0),
        })
    }

    pub fn apply(targets: super::ProxyTargets) -> Result<(), String> {
        gsettings(&["set", &socks_schema(), "host", &targets.socks.ip().to_string()])?;
        gsettings(&["set", &socks_schema(), "port", &targets.socks.port().to_string()])?;
        gsettings(&["set", SCHEMA, "mode", "manual"])?;
        Ok(())
    }

    pub fn restore(backup: &ProxyBackup) -> Result<(), String> {
        let ProxyBackup::Gnome { mode, host, port } = backup else {
            return Err("the saved proxy settings are not for this desktop".into());
        };
        gsettings(&["set", &socks_schema(), "host", host])?;
        gsettings(&["set", &socks_schema(), "port", &port.to_string()])?;
        gsettings(&["set", SCHEMA, "mode", mode])?;
        Ok(())
    }

    fn socks_schema() -> String {
        format!("{SCHEMA}.socks")
    }

    fn gsettings(args: &[&str]) -> Result<String, String> {
        let output = Command::new("gsettings")
            .args(args)
            .output()
            .map_err(|_| "system proxy control needs gsettings, which is not installed".to_string())?;
        if !output.status.success() {
            return Err(format!(
                "gsettings failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }
}

/// Loopback and private ranges never go through the tunnel: sending them there
/// breaks local development servers and printers for no benefit.
#[cfg(any(target_os = "windows", test))]
const WINDOWS_BYPASS: &str = "<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*";

/// WinINET's proxy list, naming the HTTP bridge for both schemes.
///
/// Not `socks=`: that key means SOCKS4 to WinINET, and Chrome and Edge skip it
/// altogether. Naming http and https explicitly, rather than a bare
/// `host:port`, leaves ftp and everything else direct instead of sending it to
/// a proxy that only speaks HTTP.
#[cfg(any(target_os = "windows", test))]
fn windows_proxy_server(http: SocketAddr) -> String {
    format!("http={http};https={http}")
}

/// `networksetup -listallnetworkservices` prints an explanatory first line, and
/// marks disabled services with a leading asterisk.
#[cfg(any(target_os = "macos", test))]
fn parse_mac_services(output: &str) -> Vec<String> {
    output
        .lines()
        .skip(1)
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('*'))
        .map(ToString::to_string)
        .collect()
}

/// `networksetup -getsocksfirewallproxy` prints `Enabled:`, `Server:` and
/// `Port:` lines. A service that has never had a proxy set prints empty values
/// rather than failing.
#[cfg(any(target_os = "macos", test))]
fn parse_mac_proxy(name: &str, output: &str) -> MacProxyService {
    let field = |key: &str| {
        output
            .lines()
            .find_map(|line| line.trim().strip_prefix(key))
            .map(|value| value.trim_start_matches(':').trim().to_string())
            .unwrap_or_default()
    };
    MacProxyService {
        name: name.to_string(),
        enabled: field("Enabled").eq_ignore_ascii_case("yes"),
        host: field("Server"),
        port: field("Port").parse().unwrap_or(0),
    }
}

/// `gsettings get` quotes strings and leaves numbers bare.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
fn unquote_gsettings(value: &str) -> String {
    value.trim().trim_matches('\'').trim_matches('"').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_is_pointed_at_the_http_bridge_not_at_socks() {
        // "socks=" is the syntactically correct way to declare a SOCKS proxy and
        // very nearly useless: WinINET reads it as SOCKS4, and Chrome and Edge
        // ignore it. Naming both schemes against the bridge is what applications
        // actually follow.
        let bridge: SocketAddr = "127.0.0.1:52310".parse().unwrap();
        let value = windows_proxy_server(bridge);
        assert_eq!(value, "http=127.0.0.1:52310;https=127.0.0.1:52310");
        assert!(!value.contains("socks="), "SOCKS must not be advertised to WinINET");
    }

    #[test]
    fn the_windows_bypass_keeps_local_traffic_off_the_tunnel() {
        for expected in ["<local>", "localhost", "127.*", "192.168.*", "10.*"] {
            assert!(WINDOWS_BYPASS.contains(expected), "missing bypass: {expected}");
        }
        assert!(!WINDOWS_BYPASS.contains(" "), "WinINET splits this list on semicolons only");
    }

    #[test]
    fn mac_service_list_skips_the_header_and_disabled_entries() {
        let output = "An asterisk (*) denotes that a network service is disabled.\n\
                      Wi-Fi\n\
                      Thunderbolt Bridge\n\
                      *Bluetooth PAN\n\
                      \n";
        assert_eq!(
            parse_mac_services(output),
            vec!["Wi-Fi".to_string(), "Thunderbolt Bridge".to_string()]
        );
    }

    #[test]
    fn mac_proxy_state_is_read_back_exactly() {
        let enabled = parse_mac_proxy("Wi-Fi", "Enabled: Yes\nServer: 127.0.0.1\nPort: 1819\n");
        assert_eq!(
            enabled,
            MacProxyService {
                name: "Wi-Fi".into(),
                enabled: true,
                host: "127.0.0.1".into(),
                port: 1819,
            }
        );
        // Never configured: empty values, and "No" must not read as enabled.
        let untouched = parse_mac_proxy("Wi-Fi", "Enabled: No\nServer: \nPort: 0\n");
        assert!(!untouched.enabled);
        assert_eq!(untouched.host, "");
        assert_eq!(untouched.port, 0);
    }

    #[test]
    fn gsettings_values_lose_their_quotes() {
        assert_eq!(unquote_gsettings("'none'\n"), "none");
        assert_eq!(unquote_gsettings("'127.0.0.1'"), "127.0.0.1");
        assert_eq!(unquote_gsettings("1819\n"), "1819");
        assert_eq!(unquote_gsettings("''"), "");
    }

    #[test]
    fn a_backup_survives_the_round_trip_to_disk() {
        // What is written by one build is read by the next one, possibly after
        // a crash, so the shape has to be stable.
        let cases = vec![
            ProxyBackup::Windows {
                enabled: false,
                server: String::new(),
                bypass: "<local>".into(),
            },
            ProxyBackup::Macos {
                services: vec![MacProxyService {
                    name: "Wi-Fi".into(),
                    enabled: true,
                    host: "10.0.0.1".into(),
                    port: 8080,
                }],
            },
            ProxyBackup::Gnome {
                mode: "none".into(),
                host: String::new(),
                port: 0,
            },
        ];
        for backup in cases {
            let json = serde_json::to_vec(&backup).unwrap();
            assert_eq!(serde_json::from_slice::<ProxyBackup>(&json).unwrap(), backup);
        }
    }

    #[test]
    fn a_backup_from_another_platform_is_refused_rather_than_guessed_at() {
        let json = serde_json::json!({"platform": "plan9", "enabled": true}).to_string();
        assert!(serde_json::from_str::<ProxyBackup>(&json).is_err());
    }
}
