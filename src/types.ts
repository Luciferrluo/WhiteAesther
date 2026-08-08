export type ViewId = "overview" | "lab" | "discovery" | "transports" | "routing" | "identity" | "diagnostics" | "preferences";
export type ConnectionPhase = "h2" | "h3" | "wg";

export interface ConnectionProfile {
  name: string;
  transportOrder: ConnectionPhase[];
  scanMode: "turbo" | "balanced" | "thorough" | "stealth" | "ironclad";
  ipFamily: "v4" | "v6" | "both";
  validateSecs: number;
  fragmentClientHello: boolean;
  dns: string[];
}

export const DEFAULT_PROFILE: ConnectionProfile = {
  name: "Adaptive · Iran",
  transportOrder: ["h2", "h3", "wg"],
  scanMode: "balanced",
  ipFamily: "both",
  validateSecs: 10,
  fragmentClientHello: true,
  dns: ["1.1.1.1", "1.0.0.1"],
};
