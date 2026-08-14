export type ViewId = "overview" | "lab" | "discovery" | "transports" | "routing" | "identity" | "diagnostics" | "preferences";
export type ConnectionPhase = "h2" | "h3" | "wg";
export type CoreState = "idle" | "starting" | "scanning" | "connecting" | "connected" | "reconnecting" | "stopped" | "error";
export type EndpointMode = "automatic" | "custom-first" | "custom-only";

export const ENDPOINT_MODES: Array<{ id: EndpointMode; label: string; detail: string }> = [
  { id: "automatic", label: "Automatic", detail: "Let the core find a working edge." },
  { id: "custom-first", label: "Custom first", detail: "Try the pinned address once, then search." },
  { id: "custom-only", label: "Custom only", detail: "Use the pinned address or fail." },
];

export interface ConnectionProfile {
  name: string;
  protocol: "masque" | "wg" | "gool";
  masqueTransport: "h2" | "h3";
  scanMode: "turbo" | "balanced" | "thorough" | "stealth" | "ironclad";
  ipFamily: "v4" | "v6" | "both";
  socksAddress: string;
  quickReconnect: boolean;
  validateSecs: number;
  startupSecs: number;
  reconnectSecs: number;
  dns: string[];
  fragmentClientHello: boolean;
  fragmentSize: string;
  fragmentDelay: string;
  dataCheck: boolean;
  h2Peer: string | null;
  ech: string | null;
  tlsGroups: string | null;
  performanceProfile: "auto" | "low" | "medium" | "high";
  keepaliveSecs: number;
  noize: "off" | "light" | "firewall" | "balanced" | "gfw" | "aggressive";
  profileRetry: boolean;
  logLevel: "error" | "warn" | "info" | "debug" | "trace";
  /** How `peer` is used. "automatic" ignores it entirely. */
  endpointMode: EndpointMode;
  peer: string | null;
  wgPeer: string | null;
  corePath: string | null;
  routeBlock: string;
  routeDirect: string;
  routesFile: string | null;
  team: string | null;
  accessClientId: string | null;
  accessClientSecret: string | null;
  accessEmail: string | null;
  accessToken: string | null;
  gateway: boolean;
  /** Point the OS proxy at the SOCKS listener while connected. */
  systemProxy: boolean;
  /** Keep retrying after a route drops, rather than leaving it dead. */
  autoReconnect: boolean;
  /** Leave the system proxy on a dead tunnel so apps fail rather than leak. */
  killSwitch: boolean;
}

export interface CoreSnapshot {
  state: CoreState;
  pid: number | null;
  corePath: string | null;
  version: string | null;
  transport: "masque-h2" | "masque-h3" | "wireguard" | "warp-in-warp" | null;
  endpoint: string | null;
  socksAddress: string;
  latencyMs: number | null;
  startedAt: number | null;
  lastError: string | null;
  /** What the supervisor is doing right now, including the retry countdown. */
  statusMessage: string | null;
  attempt: number;
  maxAttempts: number;
}

export interface CoreLogEvent {
  timestamp: number;
  /** "supervisor" is WhiteAesther itself: retries, give-ups, session configuration. */
  stream: "stdout" | "stderr" | "supervisor";
  level: "error" | "warn" | "info" | "debug" | "trace";
  message: string;
}

export interface CoreProbe {
  available: boolean;
  path: string | null;
  version: string | null;
  message: string;
}

export const DEFAULT_PROFILE: ConnectionProfile = {
  name: "Adaptive · Iran",
  protocol: "masque",
  masqueTransport: "h2",
  scanMode: "balanced",
  ipFamily: "both",
  socksAddress: "127.0.0.1:1819",
  quickReconnect: true,
  validateSecs: 10,
  startupSecs: 30,
  reconnectSecs: 2,
  dns: ["1.1.1.1", "1.0.0.1"],
  fragmentClientHello: true,
  fragmentSize: "16-32",
  fragmentDelay: "2-10",
  dataCheck: true,
  h2Peer: null,
  ech: null,
  tlsGroups: null,
  performanceProfile: "auto",
  keepaliveSecs: 5,
  noize: "balanced",
  profileRetry: true,
  logLevel: "info",
  endpointMode: "automatic",
  peer: null,
  wgPeer: null,
  corePath: null,
  routeBlock: "",
  routeDirect: "",
  routesFile: null,
  team: null,
  accessClientId: null,
  accessClientSecret: null,
  accessEmail: null,
  accessToken: null,
  gateway: false,
  systemProxy: false,
  autoReconnect: true,
  killSwitch: false,
};

export const IDLE_SNAPSHOT: CoreSnapshot = {
  state: "idle",
  pid: null,
  corePath: null,
  version: null,
  transport: null,
  endpoint: null,
  socksAddress: "127.0.0.1:1819",
  latencyMs: null,
  startedAt: null,
  lastError: null,
  statusMessage: null,
  attempt: 0,
  maxAttempts: 8,
};
