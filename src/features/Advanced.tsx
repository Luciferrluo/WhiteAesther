import { useMemo, useState } from "react";
import {
  Activity, FileText, Globe, Route as RouteIcon, ShieldCheck, Wifi, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildCoreCommand } from "@/core/command";
import { endpointError, normalizeEndpoint } from "@/core/endpoint";
import { REPORT_EVENT_LIMIT, buildReport, reportFilename } from "@/core/report";
import { saveReport } from "@/core/api";
import { transportName } from "./Simple";
import {
  ENDPOINT_MODES, type ConnectionProfile, type CoreLogEvent, type CoreProbe, type CoreSnapshot,
} from "@/types";

type SectionId = "status" | "routes" | "endpoint" | "traffic" | "identity" | "diagnostics";

const SECTIONS: Array<{ group: string; items: Array<{ id: SectionId; label: string; icon: LucideIcon }> }> = [
  { group: "Connection", items: [
    { id: "status", label: "Status", icon: Activity },
    { id: "routes", label: "Routes & transports", icon: RouteIcon },
    { id: "endpoint", label: "Endpoint", icon: Globe },
  ] },
  { group: "System", items: [
    { id: "traffic", label: "Traffic & DNS", icon: Wifi },
    { id: "identity", label: "Identity", icon: ShieldCheck },
  ] },
  { group: "Support", items: [{ id: "diagnostics", label: "Diagnostics", icon: FileText }] },
];

interface AdvancedProps {
  profile: ConnectionProfile;
  onChange: (profile: ConnectionProfile) => void;
  snapshot: CoreSnapshot;
  probe: CoreProbe;
  logs: CoreLogEvent[];
  runtime: string;
  appVersion: string;
  onSave: () => void;
  onToast: (title: string, message: string, error?: boolean) => void;
}

export function Advanced(props: AdvancedProps) {
  const [section, setSection] = useState<SectionId>("status");
  const heading = SECTIONS.flatMap((g) => g.items).find((i) => i.id === section);

  return (
    <div className="grid h-full grid-cols-[196px_minmax(0,1fr)] overflow-hidden">
      <nav className="flex flex-col gap-0.5 overflow-y-auto border-r bg-card p-2" aria-label="Settings sections">
        {SECTIONS.map((group) => (
          <div key={group.group} className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1 pt-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.group}
            </span>
            {group.items.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={section === id}
                onClick={() => setSection(id)}
                className={[
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13.5px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  section === id
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="size-[15px]" />
                {label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[19px] font-semibold tracking-tight">{heading?.label}</h2>
            <p className="text-sm text-muted-foreground">{BLURB[section]}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StateBadge snapshot={props.snapshot} />
            <Button variant="outline" size="sm" onClick={props.onSave}>
              Save profile
            </Button>
          </div>
        </div>

        {section === "status" && <Status {...props} />}
        {section === "routes" && <Routes {...props} />}
        {section === "endpoint" && <Endpoint {...props} />}
        {section === "traffic" && <Traffic {...props} />}
        {section === "identity" && <Identity {...props} />}
        {section === "diagnostics" && <Diagnostics {...props} />}
      </div>
    </div>
  );
}

const BLURB: Record<SectionId, string> = {
  status: "What the core is doing right now.",
  routes: "How hard to search, and what the tunnel rides on.",
  endpoint: "Pin a specific gateway, or let the core find one.",
  traffic: "Where traffic goes once the tunnel is up.",
  identity: "Cloudflare Zero Trust enrolment.",
  diagnostics: "Build a report you can hand to someone.",
};

function StateBadge({ snapshot }: { snapshot: CoreSnapshot }) {
  if (snapshot.state === "connected")
    return <Badge variant="ok" className="gap-1.5"><span className="size-1.5 rounded-full bg-current" />Connected</Badge>;
  if (snapshot.state === "error")
    return <Badge variant="bad" className="gap-1.5"><span className="size-1.5 rounded-full bg-current" />Stopped</Badge>;
  if (snapshot.state === "idle") return <Badge variant="outline">Idle</Badge>;
  return (
    <Badge variant="warn" className="gap-1.5">
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      {snapshot.attempt > 0 ? `Attempt ${snapshot.attempt}/${snapshot.maxAttempts}` : "Working"}
    </Badge>
  );
}

/** One labelled control on its own row, with the rule above it. */
function Row({ title, help, children, first }: {
  title: string; help?: string; children: React.ReactNode; first?: boolean;
}) {
  return (
    <>
      {first ? null : <Separator />}
      <div className="flex items-center justify-between gap-6 py-3.5">
        <div className="flex max-w-[62%] flex-col gap-1">
          <Label className="text-[13.5px]">{title}</Label>
          {help ? <span className="text-[13px] leading-snug text-muted-foreground">{help}</span> : null}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </>
  );
}

function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: Array<[T, string]>; onChange: (value: T) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList className="h-9">
        {options.map(([id, label]) => (
          <TabsTrigger key={id} value={id} className="px-3 py-1 text-[13px]">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function Status({ snapshot, probe, logs, profile }: AdvancedProps) {
  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <Metric label="Core" value={probe.available ? "Ready" : "Missing"} />
        <Metric label="Transport" value={snapshot.transport ? transportName(snapshot.transport) : "—"} />
        <Metric label="Edge" value={snapshot.endpoint ?? "—"} mono />
        <Metric label="Latency" value={snapshot.latencyMs == null ? "—" : `${snapshot.latencyMs.toFixed(1)} ms`} mono />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[15px]">Live</CardTitle></CardHeader>
        <CardContent>
          <LogList logs={logs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[15px]">What will run</CardTitle>
          <CardDescription>
            The core is launched with these arguments. Zero Trust secrets go through the environment and are not
            shown here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed text-foreground/80">
            {buildCoreCommand(profile)}
          </pre>
        </CardContent>
      </Card>
    </>
  );
}

function Metric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card className="p-3.5">
      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={`truncate text-[15px] font-medium ${mono ? "tabular font-mono" : ""}`}>{value}</span>
      </div>
    </Card>
  );
}

function LogList({ logs }: { logs: CoreLogEvent[] }) {
  if (!logs.length)
    return <p className="py-6 text-center text-[13px] text-muted-foreground">No events yet. Connect to populate this.</p>;
  return (
    <div className="flex max-h-[280px] flex-col gap-1 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-[11.5px]">
      {logs.slice(-200).map((entry, index) => (
        <div key={`${entry.timestamp}-${index}`} className="grid grid-cols-[64px_78px_minmax(0,1fr)] gap-2.5">
          <span className="tabular text-muted-foreground">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </span>
          <span className={LEVEL[entry.level] ?? "text-muted-foreground"}>{entry.stream}</span>
          <span className="break-words text-foreground/80">{entry.message}</span>
        </div>
      ))}
    </div>
  );
}

const LEVEL: Record<string, string> = {
  error: "text-destructive",
  warn: "text-warning",
  info: "text-primary",
  debug: "text-muted-foreground",
  trace: "text-muted-foreground",
};

function Routes({ profile, onChange }: AdvancedProps) {
  const set = (patch: Partial<ConnectionProfile>) => onChange({ ...profile, ...patch });
  return (
    <>
      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-[15px]">Search</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Row first title="Search depth" help="Deeper searches take longer but survive stricter filtering.">
            <Seg
              value={profile.scanMode}
              onChange={(scanMode) => set({ scanMode })}
              options={[["turbo", "turbo"], ["balanced", "balanced"], ["thorough", "thorough"], ["stealth", "stealth"], ["ironclad", "ironclad"]]}
            />
          </Row>
          <Row title="Transport" help="H3 is faster. H2 survives networks that block UDP. Retries alternate between them either way.">
            <Seg
              value={profile.masqueTransport}
              onChange={(masqueTransport) => set({ masqueTransport, protocol: "masque" })}
              options={[["h2", "h2"], ["h3", "h3"]]}
            />
          </Row>
          <Row title="Addresses" help="Turn off IPv6 where the network handles it badly.">
            <Seg
              value={profile.ipFamily}
              onChange={(ipFamily) => set({ ipFamily })}
              options={[["both", "both"], ["v4", "IPv4"], ["v6", "IPv6"]]}
            />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-[15px]">Anti-blocking</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Row first title="Split the TLS opening" help="Defeats filtering that reads only the first packet. HTTP/2 only.">
            <Switch
              checked={profile.fragmentClientHello}
              onCheckedChange={(fragmentClientHello) => set({ fragmentClientHello })}
            />
          </Row>
          <Row title="Obfuscation profile" help="Padding that makes tunnel traffic harder to fingerprint.">
            <Seg
              value={profile.noize}
              onChange={(noize) => set({ noize })}
              options={[["off", "off"], ["light", "light"], ["balanced", "balanced"], ["gfw", "gfw"], ["aggressive", "aggressive"]]}
            />
          </Row>
          <Row title="End-to-end data check" help="Expose the proxy only after a real tunnelled request succeeds.">
            <Switch checked={profile.dataCheck} onCheckedChange={(dataCheck) => set({ dataCheck })} />
          </Row>
        </CardContent>
      </Card>
    </>
  );
}

function Endpoint({ profile, onChange }: AdvancedProps) {
  const set = (patch: Partial<ConnectionProfile>) => onChange({ ...profile, ...patch });
  const error = endpointError(profile.endpointMode, profile.peer ?? "");
  const canonical = normalizeEndpoint(profile.peer ?? "");
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-[15px]">Pinned endpoint</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <Row first title="Endpoint" help="Pin a specific gateway, or let the core find one.">
          <Seg
            value={profile.endpointMode}
            onChange={(endpointMode) => set({ endpointMode })}
            options={ENDPOINT_MODES.map((m) => [m.id, m.label] as [typeof m.id, string])}
          />
        </Row>
        {profile.endpointMode !== "automatic" ? (
          <>
            <Separator />
            <div className="flex flex-col gap-2 py-3.5">
              <Label htmlFor="peer" className="text-[13.5px]">Address</Label>
              <Input
                id="peer"
                className="font-mono"
                placeholder="162.159.192.18:443"
                value={profile.peer ?? ""}
                onChange={(event) => set({ peer: event.target.value || null })}
              />
              <span className={`text-[13px] leading-snug ${error ? "text-destructive" : "text-muted-foreground"}`}>
                {error ??
                  `${canonical && canonical !== profile.peer?.trim() ? `Reads as ${canonical}. ` : ""}${
                    profile.endpointMode === "custom-first"
                      ? "One attempt goes here; if it fails the core searches instead and says so."
                      : "Every attempt goes here. Nothing else is tried."
                  }`}
              </span>
            </div>
          </>
        ) : profile.peer?.trim() ? (
          <>
            <Separator />
            <p className="py-3.5 text-[13px] text-muted-foreground">
              A saved address is kept but not used while this is Automatic.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Traffic({ profile, onChange, runtime }: AdvancedProps) {
  const set = (patch: Partial<ConnectionProfile>) => onChange({ ...profile, ...patch });
  return (
    <>
      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-[15px]">Reach</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Row first title="Set the system proxy while connected" help={systemProxyHelp(runtime)}>
            <Switch checked={profile.systemProxy} onCheckedChange={(systemProxy) => set({ systemProxy })} />
          </Row>
          <div className="pb-1 text-[13px] text-muted-foreground">
            Put back on disconnect. If the app is killed rather than closed, the next launch restores it.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-[15px]">Local proxy and DNS</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="socks" className="text-[13.5px]">Proxy address</Label>
              <Input
                id="socks"
                className="font-mono"
                value={profile.socksAddress}
                onChange={(event) => set({ socksAddress: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dns" className="text-[13.5px]">DNS resolvers</Label>
              <Input
                id="dns"
                className="font-mono"
                value={profile.dns.join(", ")}
                onChange={(event) =>
                  set({ dns: event.target.value.split(",").map((v) => v.trim()).filter(Boolean) })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function systemProxyHelp(runtime: string): string {
  const os = runtime.split(" · ")[0]?.toLowerCase();
  if (os === "windows") return "Sets the WinINET proxy. Most apps follow it; some bring their own settings.";
  if (os === "macos") return "Sets the SOCKS proxy on every active network service.";
  if (os === "linux") return "Sets the GNOME proxy. Desktops that ignore gsettings are unaffected.";
  return "Sets the operating system's proxy settings.";
}

function Identity({ profile, onChange }: AdvancedProps) {
  const set = (patch: Partial<ConnectionProfile>) => onChange({ ...profile, ...patch });
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-[15px]">Cloudflare Zero Trust</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-2">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Team" value={profile.team ?? ""} onChange={(team) => set({ team: team || null })} placeholder="team name" />
          <Field label="Email" value={profile.accessEmail ?? ""} onChange={(v) => set({ accessEmail: v || null })} placeholder="you@example.com" />
          <Field label="Access client ID" value={profile.accessClientId ?? ""} onChange={(v) => set({ accessClientId: v || null })} />
          <Field label="Access client secret" type="password" value={profile.accessClientSecret ?? ""} onChange={(v) => set({ accessClientSecret: v || null })} />
        </div>
        <p className="text-[13px] text-muted-foreground">
          Secrets are held in memory and passed to the core through its environment. They are never written to the
          profile on disk, and never appear in a diagnostics report.
        </p>
        <Separator />
        <Row first title="Send web traffic to Gateway" help="Applies the enrolled organisation's policy. Adds a hop.">
          <Switch checked={profile.gateway} onCheckedChange={(gateway) => set({ gateway })} />
        </Row>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-[13.5px]">{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Diagnostics({ snapshot, profile, probe, logs, runtime, appVersion, onToast }: AdvancedProps) {
  const [includeSystem, setIncludeSystem] = useState(true);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);
  const [redact, setRedact] = useState(true);

  const report = useMemo(
    () =>
      buildReport({
        appVersion,
        engineVersion: probe.version,
        system: runtime,
        snapshot,
        profile,
        logs,
        options: { includeSystem, includeSettings, includeEvents, redact },
      }),
    [appVersion, probe.version, runtime, snapshot, profile, logs, includeSystem, includeSettings, includeEvents, redact],
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[15px]">Report</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row first title="App and engine version" help="Always included — a report without it cannot be read.">
            <Switch checked disabled />
          </Row>
          <Row title="Operating system" help={runtime}>
            <Switch checked={includeSystem} onCheckedChange={setIncludeSystem} />
          </Row>
          <Row title="Connection settings" help="No Zero Trust credentials and no pinned address — only whether one is set.">
            <Switch checked={includeSettings} onCheckedChange={setIncludeSettings} />
          </Row>
          <Row title={`Recent events (up to ${REPORT_EVENT_LIMIT})`} help="What the core and the supervisor did.">
            <Switch checked={includeEvents} onCheckedChange={setIncludeEvents} />
          </Row>
          <Row title="Replace IP addresses" help="Swaps them for placeholders. Most problems can still be diagnosed.">
            <Switch checked={redact} onCheckedChange={setRedact} />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed">
            {report}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(report);
                  onToast("Copied", "The report is on the clipboard.");
                } catch (error) {
                  onToast("Copy failed", String(error), true);
                }
              }}
            >
              Copy
            </Button>
            <Button
              onClick={async () => {
                try {
                  onToast("Report saved", await saveReport(report, reportFilename()));
                } catch (error) {
                  onToast("Save failed", error instanceof Error ? error.message : String(error), true);
                }
              }}
            >
              Save report
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
