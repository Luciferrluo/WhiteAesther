import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ConnectionProfile, CoreLogEvent, CoreProbe, CoreSnapshot } from "../types";

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

export async function subscribeCore(
  onStatus: (status: CoreSnapshot) => void,
  onLog: (log: CoreLogEvent) => void,
): Promise<UnlistenFn> {
  requireDesktop();
  const unlistenStatus = await listen<CoreSnapshot>("core-status", (event) => onStatus(event.payload));
  const unlistenLog = await listen<CoreLogEvent>("core-log", (event) => onLog(event.payload));
  return () => { unlistenStatus(); unlistenLog(); };
}

export type TrayAction = "toggle-connection" | "open-diagnostics";

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
 * Applies or removes the system proxy on a connection that is already up.
 * Returns whether it is now applied.
 */
export async function setSystemProxy(enabled: boolean): Promise<boolean> {
  requireDesktop();
  return invoke("set_system_proxy", { enabled });
}
