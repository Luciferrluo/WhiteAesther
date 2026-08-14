/**
 * What the settings search can find.
 *
 * Written out rather than derived from the rendered controls: the words someone
 * types are rarely the words on the label. Someone looking for "kill switch"
 * will not search for "Reach", and someone who wants to stop DNS leaking will
 * not know the setting is called "Resolvers".
 */
export type SectionId = "status" | "routes" | "endpoint" | "traffic" | "identity" | "diagnostics";

export interface SettingEntry {
  label: string;
  section: SectionId;
  /** Where it lives, shown so the result is findable again without searching. */
  where: string;
  /** Extra words that should match it, including the ones people actually use. */
  keywords: string;
}

export const SECTION_LABELS: Record<SectionId, string> = {
  status: "Status",
  routes: "Routes & transports",
  endpoint: "Endpoint",
  traffic: "Traffic & DNS",
  identity: "Identity",
  diagnostics: "Diagnostics",
};

export const SETTINGS: SettingEntry[] = [
  { label: "Live event log", section: "status", where: "Status", keywords: "log console output events stderr debug what is happening" },
  { label: "What will run", section: "status", where: "Status", keywords: "command line arguments flags cli invocation" },
  { label: "Round-trip chart", section: "status", where: "Status", keywords: "latency ping ms speed graph chart rtt" },
  { label: "Speed test", section: "status", where: "Status", keywords: "throughput download mbps bandwidth how fast" },

  { label: "Protocol", section: "routes", where: "Routes & transports", keywords: "masque h2 h3 wireguard wg warp in warp gool tcp quic udp transport" },
  { label: "Search depth", section: "routes", where: "Routes & transports", keywords: "scan mode turbo balanced thorough stealth ironclad how hard to look" },
  { label: "Addresses", section: "routes", where: "Routes & transports", keywords: "ipv4 ipv6 dual stack ip family v4 v6" },
  { label: "Reuse the last working edge", section: "routes", where: "Routes & transports", keywords: "quick reconnect cached gateway faster connect" },
  { label: "End-to-end data check", section: "routes", where: "Routes & transports", keywords: "verify tunnel really works data check validation" },
  { label: "Resource profile", section: "routes", where: "Routes & transports", keywords: "performance cpu concurrency low medium high auto" },
  { label: "Timeouts", section: "routes", where: "Routes & transports", keywords: "validation deadline startup deadline reconnect delay seconds timeout" },
  { label: "Split the TLS opening", section: "routes", where: "Routes & transports", keywords: "fragment client hello dpi censorship filtering bypass" },
  { label: "Obfuscation profile", section: "routes", where: "Routes & transports", keywords: "noize noise padding gfw firewall aggressive hide traffic fingerprint" },
  { label: "Encrypted Client Hello", section: "routes", where: "Routes & transports", keywords: "ech sni hostname hiding" },
  { label: "TLS groups", section: "routes", where: "Routes & transports", keywords: "key exchange curves x25519 tls" },
  { label: "WireGuard keepalive", section: "routes", where: "Routes & transports", keywords: "keepalive udp mapping nat" },

  { label: "Endpoint scanner", section: "endpoint", where: "Endpoint", keywords: "scan gateways find ip addresses test candidates rank" },
  { label: "Pinned endpoint", section: "endpoint", where: "Endpoint", keywords: "custom peer address force specific gateway ip port" },
  { label: "How the gateway is chosen", section: "endpoint", where: "Endpoint", keywords: "automatic custom first custom only endpoint mode" },
  { label: "Per-protocol overrides", section: "endpoint", where: "Endpoint", keywords: "h2 peer wireguard peer separate address" },

  { label: "Set the system proxy while connected", section: "traffic", where: "Traffic & DNS", keywords: "whole machine system proxy windows wininet browser all apps" },
  { label: "Block traffic if the tunnel drops", section: "traffic", where: "Traffic & DNS", keywords: "kill switch killswitch fail closed leak protection block traffic drop" },
  { label: "Keep me connected", section: "traffic", where: "Traffic & DNS", keywords: "auto reconnect retry keep alive stay connected reconnection" },
  { label: "Local proxy address", section: "traffic", where: "Traffic & DNS", keywords: "socks5 socks port 1819 bind listener point apps at" },
  { label: "DNS resolvers", section: "traffic", where: "Traffic & DNS", keywords: "dns resolver 1.1.1.1 leak nameserver" },
  { label: "Routing rules", section: "traffic", where: "Traffic & DNS", keywords: "route block direct bypass split tunnel exclude sites rules file" },

  { label: "Cloudflare Zero Trust", section: "identity", where: "Identity", keywords: "team access client id secret token enrolment organisation login" },
  { label: "Send web traffic to Gateway", section: "identity", where: "Identity", keywords: "gateway policy filtering organisation" },

  { label: "Core executable", section: "diagnostics", where: "Diagnostics", keywords: "aether path binary engine location" },
  { label: "Log detail", section: "diagnostics", where: "Diagnostics", keywords: "log level verbose trace debug info warn error" },
  { label: "Profile name", section: "diagnostics", where: "Diagnostics", keywords: "name profile label" },
  { label: "Build a report", section: "diagnostics", where: "Diagnostics", keywords: "diagnostics report share support bug redact save copy" },
];

/**
 * Ranks matches so the closest one is first and can be taken with Enter.
 *
 * A label match outranks a keyword match, and a match at the start of the label
 * outranks one in the middle -- typing "dns" should reach "DNS resolvers"
 * before "Send web traffic to Gateway", which only mentions it in passing.
 */
export function searchSettings(query: string, limit = 8): SettingEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return SETTINGS.slice(0, limit);

  const scored = SETTINGS.map((entry) => {
    const label = entry.label.toLowerCase();
    let score = 0;
    if (label.startsWith(needle)) score = 100;
    else if (label.includes(needle)) score = 70;
    else if (entry.where.toLowerCase().includes(needle)) score = 40;
    else if (entry.keywords.includes(needle)) score = 30;
    return { entry, score };
  }).filter((candidate) => candidate.score > 0);

  scored.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));
  return scored.slice(0, limit).map((candidate) => candidate.entry);
}
