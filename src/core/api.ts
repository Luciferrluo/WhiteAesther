import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ChainSettings, ConnectionProfile, CoreLogEvent, CoreProbe, CoreSnapshot } from "../types";

export function isDesktopRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function requireDesktop() {
  if (!isDesktopRuntime()) {
    throw new Error("Real core control is available in the WhiteAesther desktop app, not the browser preview.");
  }
}

export async function runtimeInfo(): Promise<{ os: string; arch: string }> {
  requireDesktop();
  return invoke("runtime_info");
}

export async function probeCore(profile: ConnectionProfile): Promise<CoreProbe> {
  requireDesktop();
  return invoke("probe_core", { profile });
}

export async function startCore(profile: ConnectionProfile): Promise<CoreSnapshot> {
  requireDesktop();
  return invoke("start_core", { profile });
}

export async function stopCore(): Promise<CoreSnapshot> {
  requireDesktop();
  return invoke("stop_core");
}

export async function getCoreStatus(): Promise<CoreSnapshot> {
  requireDesktop();
  return invoke("core_status");
}

export async function getCoreLogs(): Promise<CoreLogEvent[]> {
  requireDesktop();
  return invoke("core_logs");
}

export async function loadProfile(): Promise<ConnectionProfile> {
  requireDesktop();
  return invoke("load_profile");
}

export async function saveProfile(profile: ConnectionProfile): Promise<ConnectionProfile> {
  requireDesktop();
  return invoke("save_profile", { profile });
}

/** Writes an already-composed, already-reviewed report and returns its path. */
export async function saveReport(contents: string, filename: string): Promise<string> {
  requireDesktop();
  return invoke("save_report", { contents, filename });
}

/**
 * Log lines arrive in batches, not one message per line.
 *
 * The thread reading the core's output is the only thing draining its pipe, so
 * a message per line made a busy window throttle the core itself. Batching is
 * the contract, not an optimisation: keep appending a whole batch at once.
 */
export async function subscribeCore(
  onStatus: (status: CoreSnapshot) => void,
  onLogs: (logs: CoreLogEvent[]) => void,
): Promise<UnlistenFn> {
  requireDesktop();
  const unlistenStatus = await listen<CoreSnapshot>("core-status", (event) => onStatus(event.payload));
  const unlistenLogs = await listen<CoreLogEvent[]>("core-logs", (event) => onLogs(event.payload));
  return () => { unlistenStatus(); unlistenLogs(); };
}

export type TrayAction = "toggle-connection" | "open-diagnostics" | "restore-proxy";

export async function subscribeTrayActions(onAction: (action: TrayAction) => void): Promise<UnlistenFn> {
  requireDesktop();
  return listen<TrayAction>("tray-action", (event) => onAction(event.payload));
}

export interface ScanCandidate {
  peer: string;
  rttMs: number;
}

export interface ScanOutcome {
  candidates: ScanCandidate[];
  /** Which transport produced these, which is not always the one configured. */
  transport: string;
  /** True when the configured transport found nothing and the other was swept. */
  fellBack: boolean;
}

/** Ranks reachable gateways without connecting. Rejects while a tunnel is up. */
export async function scanEndpoints(profile: ConnectionProfile, limit = 8): Promise<ScanOutcome> {
  requireDesktop();
  return invoke("scan_endpoints", { profile, limit });
}

/** Validates one address with a real authenticated handshake. */
export async function testEndpoint(profile: ConnectionProfile, endpoint: string): Promise<ScanCandidate> {
  requireDesktop();
  return invoke("test_endpoint", { profile, endpoint });
}

/** Kills an in-flight scan. Returns false when there was nothing to stop. */
export async function cancelScan(): Promise<boolean> {
  requireDesktop();
  return invoke("cancel_scan");
}

/**
 * Times one round trip through the live tunnel, in milliseconds.
 *
 * Null means there was nothing to measure — no tunnel, or a probe that did not
 * come back. Both are ordinary while a route is settling.
 */
export async function probeLatency(): Promise<number | null> {
  requireDesktop();
  return invoke("probe_latency");
}

export interface SpeedResult {
  mbps: number;
  bytes: number;
  seconds: number;
}

/** Downloads a fixed payload through the tunnel and reports the throughput. */
export async function speedTest(): Promise<SpeedResult> {
  requireDesktop();
  return invoke("speed_test");
}

export interface ExitInfo {
  /** The address a website logs for this connection. */
  ip: string;
  /** Two-letter country as Cloudflare geolocates that address. */
  country: string;
  colo: string;
  /**
   * Whether Cloudflare sees a WARP connection. Only meaningful when `chained`
   * is false — through a second hop it is always off, because the last leg is
   * the node's own connection.
   */
  warp: boolean;
  gateway: boolean;
  /** Whether this was read through the second hop rather than the tunnel. */
  chained: boolean;
}

/** Reads the exit address and country from inside the tunnel. */
export async function exitInfo(): Promise<ExitInfo> {
  requireDesktop();
  return invoke("exit_info");
}

export interface ChainStatus {
  running: boolean;
  /** Where traffic is carried while the chain is up, or null when it is not. */
  address: string | null;
}

export interface ChainNode {
  name: string;
  /** Which subscription supplied it. */
  source: string;
  kind: string;
  /** Milliseconds through the tunnel, or null when the last test failed. */
  delay: number | null;
}

/**
 * Turns the chain on or off on a live connection, and reloads it after a
 * subscription changes. Returns whether it is now carrying traffic.
 */
export async function setChain(settings: ChainSettings): Promise<boolean> {
  requireDesktop();
  return invoke("set_chain", { settings });
}

export async function chainStatus(): Promise<ChainStatus> {
  requireDesktop();
  return invoke("chain_status");
}

export async function chainNodes(): Promise<ChainNode[]> {
  requireDesktop();
  return invoke("chain_nodes");
}

/**
 * Measures one node through the tunnel.
 *
 * Null means the node could not be reached from behind the tunnel — which is
 * the answer the dashboard needs, not an error to report.
 */
export async function chainTest(source: string, node: string): Promise<number | null> {
  requireDesktop();
  return invoke("chain_test", { source, node });
}

export async function chainSelect(node: string): Promise<void> {
  requireDesktop();
  return invoke("chain_select", { node });
}

/**
 * Applies or removes the system proxy on a connection that is already up.
 * Returns whether it is now applied.
 */
export async function setSystemProxy(enabled: boolean): Promise<boolean> {
  requireDesktop();
  return invoke("set_system_proxy", { enabled });
}
