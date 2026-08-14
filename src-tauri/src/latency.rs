//! Round-trip measurement through the live tunnel.
//!
//! The engine reports a latency figure exactly once, on the log line that
//! announces the selected gateway (`rtt 84.5ms`). That is a single number from
//! the moment of connecting, so it cannot answer the question the status screen
//! actually asks: is the route still good *now*.
//!
//! So we measure it ourselves. A SOCKS5 CONNECT through the local listener out
//! to a fixed address times the whole path — client, engine, MASQUE tunnel,
//! edge, and the TCP handshake at the far end. It is the same work a browser
//! does to open a connection, which is what makes it worth showing.

use std::io::{Read, Write};
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;

use crate::core_supervisor::CoreSupervisor;
use crate::http_bridge::socks5_connect;

/// A literal address, so the figure is the path and not a DNS lookup that would
/// swamp it. Cloudflare anycast on 443, which is up wherever the tunnel lands.
///
/// A routing rule that sends this address direct would measure the direct path
/// instead; that is a deliberate choice by whoever wrote the rule.
const TARGET_HOST: &str = "1.1.1.1";
const TARGET_PORT: u16 = 443;

/// Short on purpose. A probe that has not answered in this long has told us
/// what we needed to know, and holding the thread longer only delays the next
/// sample.
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// Times one round trip through the tunnel, in milliseconds.
///
/// Returns `Ok(None)` rather than an error when there is no tunnel to measure:
/// the caller polls this on a timer, and a disconnect is an ordinary outcome,
/// not a failure worth surfacing to the user.
#[tauri::command]
pub async fn probe_latency(supervisor: State<'_, CoreSupervisor>) -> Result<Option<f64>, String> {
    let Some(socks) = supervisor.connected_socks() else {
        return Ok(None);
    };
    let address: SocketAddr = socks
        .parse()
        .map_err(|_| format!("the proxy address {socks} cannot be parsed"))?;

    // Blocking sockets on the main thread freeze the window; every other command
    // in this app learned that the hard way.
    tauri::async_runtime::spawn_blocking(move || measure(address))
        .await
        .map_err(|error| format!("the latency probe did not finish: {error}"))
}

fn measure(socks: SocketAddr) -> Option<f64> {
    let started = Instant::now();
    match socks5_connect(socks, TARGET_HOST, TARGET_PORT, PROBE_TIMEOUT) {
        Ok(stream) => {
            let elapsed = started.elapsed();
            // Closing before the timer would count teardown in the figure.
            drop(stream);
            Some(elapsed.as_secs_f64() * 1000.0)
        }
        // A refused or timed-out probe is a real answer about the route, but it
        // is not a number, and a gap in the chart says it better than a zero.
        Err(_) => None,
    }
}

/// How fast the tunnel actually carries bulk traffic.
const SPEED_HOST: &str = "speed.cloudflare.com";
const SPEED_BYTES: usize = 10_000_000;
/// Generous: a slow route still deserves a number rather than an error.
const SPEED_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedResult {
    /// Megabits per second, the unit connections are sold in.
    pub mbps: f64,
    pub bytes: usize,
    pub seconds: f64,
}

/// Downloads a fixed payload through the tunnel and reports the throughput.
///
/// Plain HTTP on purpose: this crate has no TLS client, and the endpoint serves
/// the same bytes either way. There is nothing secret in a stream of zeroes, and
/// the tunnel is carrying it regardless.
#[tauri::command]
pub async fn speed_test(supervisor: State<'_, CoreSupervisor>) -> Result<SpeedResult, String> {
    let socks = supervisor
        .connected_socks()
        .ok_or("connect first — there is no tunnel to measure")?;
    let address: SocketAddr = socks
        .parse()
        .map_err(|_| format!("the proxy address {socks} cannot be parsed"))?;

    tauri::async_runtime::spawn_blocking(move || download(address))
        .await
        .map_err(|error| format!("the speed test did not finish: {error}"))?
}

fn download(socks: SocketAddr) -> Result<SpeedResult, String> {
    let mut stream = socks5_connect(socks, SPEED_HOST, 80, SPEED_TIMEOUT)
        .map_err(|error| format!("the tunnel refused the connection: {error}"))?;
    stream
        .set_read_timeout(Some(SPEED_TIMEOUT))
        .map_err(|error| error.to_string())?;

    let request = format!(
        "GET /__down?bytes={SPEED_BYTES} HTTP/1.1\r\nHost: {SPEED_HOST}\r\n\
         User-Agent: WhiteAesther\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("could not send the request: {error}"))?;

    // Timed from the first byte, so the figure is transfer rate and not the
    // handshake that preceded it — the round-trip chart already covers that.
    let mut buffer = [0_u8; 64 * 1024];
    let mut total = 0_usize;
    let mut started: Option<Instant> = None;
    loop {
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => {
                started.get_or_insert_with(Instant::now);
                total += read;
            }
            Err(error) => return Err(format!("the transfer stopped early: {error}")),
        }
    }

    let elapsed = started.ok_or("the endpoint sent nothing back")?.elapsed();
    let seconds = elapsed.as_secs_f64().max(0.001);
    if total < SPEED_BYTES / 2 {
        return Err(format!(
            "only {total} of {SPEED_BYTES} bytes arrived before the connection closed"
        ));
    }
    Ok(SpeedResult {
        mbps: (total as f64 * 8.0) / seconds / 1_000_000.0,
        bytes: total,
        seconds,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_download_from_a_dead_listener_fails_rather_than_reporting_zero() {
        let dead: SocketAddr = "127.0.0.1:1".parse().unwrap();
        assert!(download(dead).is_err(), "a refused tunnel is not a 0 Mbps result");
    }

    #[test]
    fn a_probe_against_a_dead_listener_reports_nothing_rather_than_zero() {
        // Port 1 on loopback has nothing behind it, so the connect fails fast.
        let dead: SocketAddr = "127.0.0.1:1".parse().unwrap();
        assert_eq!(measure(dead), None, "a failed probe must not read as 0 ms");
    }
}
