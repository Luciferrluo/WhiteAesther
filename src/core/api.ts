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
