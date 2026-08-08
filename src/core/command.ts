import type { ConnectionProfile } from "../types";

export function buildCoreCommand(profile: ConnectionProfile): string {
  const [primary] = profile.transportOrder;
  const transport = primary === "h2" ? "--masque --h2" : primary === "h3" ? "--masque" : "--wg";
  return [
    "aether",
    transport,
    `--scan ${profile.scanMode}`,
    profile.ipFamily === "both" ? "--dual" : profile.ipFamily === "v6" ? "-6" : "-4",
    "--quick-reconnect",
    `--validate-secs ${profile.validateSecs}`,
    profile.fragmentClientHello ? "--fragment" : "",
    `--dns ${profile.dns.join(",")}`,
  ].filter(Boolean).join(" ");
}
