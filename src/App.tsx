import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, BadgeCheck, Clock3, CloudCog, Command, FlaskConical,
  Gauge, Globe2, Laptop, LockKeyhole, Network, PackageCheck, Radar, Route,
  Save, ScanSearch, Settings2, ShieldCheck, Split, TerminalSquare, TimerReset, Waypoints,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import { buildCoreCommand } from "./core/command";
import { DEFAULT_PROFILE, type ConnectionPhase, type ViewId } from "./types";
import "./App.css";

const navigation: Array<{ id: ViewId; label: string; icon: typeof Gauge; group?: string }> = [
  { id: "overview", label: "Overview", icon: Gauge, group: "Workspace" },
  { id: "lab", label: "Connection Lab", icon: FlaskConical },
  { id: "discovery", label: "Discovery", icon: Radar },
  { id: "transports", label: "Transports", icon: Waypoints },
  { id: "routing", label: "Routing & DNS", icon: Split, group: "Network" },
  { id: "identity", label: "Zero Trust", icon: ShieldCheck },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
];

const phaseCopy: Record<ConnectionPhase, { label: string; detail: string }> = {
  h2: { label: "MASQUE H2", detail: "TCP · fragmented ClientHello" },
  h3: { label: "MASQUE H3", detail: "QUIC · ECH auto · UDP" },
  wg: { label: "WireGuard", detail: "Noize balanced · port matrix" },
};

type Status = "ready" | "scanning" | "connected";

function App() {
  const [view, setView] = useState<ViewId>("overview");
  const [status, setStatus] = useState<Status>("ready");
  const [activePhase, setActivePhase] = useState<ConnectionPhase | null>(null);
  const [completedPhases, setCompletedPhases] = useState<ConnectionPhase[]>([]);
  const [preset] = useState(DEFAULT_PROFILE);
  const [runtime, setRuntime] = useState("Desktop shell");
  const [toast, setToast] = useState<string | null>(null);
  const command = useMemo(() => buildCoreCommand(preset), [preset]);

  useEffect(() => {
    invoke<{ os: string; arch: string }>("runtime_info")
      .then((info) => setRuntime(`${info.os} · ${info.arch}`))
      .catch(() => setRuntime("Browser preview"));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function runConnection() {
    if (status === "connected") {
      setStatus("ready"); setActivePhase(null); setCompletedPhases([]); return;
    }
    if (status === "scanning") return;
    setView("overview"); setStatus("scanning"); setCompletedPhases([]);
    for (const phase of preset.transportOrder) {
      setActivePhase(phase);
      await new Promise((resolve) => window.setTimeout(resolve, 620));
      setCompletedPhases((current) => [...current, phase]);
    }
    setActivePhase(null); setStatus("connected"); setToast("Connection found · MASQUE H2 · 84 ms");
  }

  function saveProfile() {
    localStorage.setItem("whiteaesther-profile", JSON.stringify(preset));
    setToast("Adaptive · Iran saved on this device");
  }
  const title = navigation.find((item) => item.id === view)?.label ?? "Preferences";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><span /><span /></div><div><strong>WhiteAesther</strong><small>DESKTOP LAB</small></div></div>
        <nav className="navigation" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon, group }) => <div key={id}>{group && <p className="nav-label">{group}</p>}<button className={`nav-item ${view === id ? "active" : ""}`} onClick={() => setView(id)}><Icon /><span>{label}</span>{id === "diagnostics" && <i className="nav-dot" />}</button></div>)}
        </nav>
        <div className="sidebar-footer"><button className={`nav-item ${view === "preferences" ? "active" : ""}`} onClick={() => setView("preferences")}><Settings2 /><span>Preferences</span></button><div className="core-card"><span className="core-pulse" /><div><strong>Shell ready</strong><small>{runtime}</small></div><ArrowRight /></div></div>
      </aside>
      <main className="main">
        <header className="topbar"><div><p className="eyebrow">Workspace / {title}</p><h1>{title}</h1></div><div className="top-actions"><Button variant="icon" title="Core command"><TerminalSquare /></Button><Button variant="secondary" onClick={saveProfile}><Save />Save profile</Button></div></header>
        <div className="content">
          {view === "overview" && <Overview status={status} activePhase={activePhase} completedPhases={completedPhases} onConnect={runConnection} onOpenLab={() => setView("lab")} />}
          {view === "lab" && <ConnectionLab command={command} onRun={runConnection} />}
          {view === "discovery" && <Discovery />}
          {view === "transports" && <Transports />}
          {view === "routing" && <Routing />}
          {view === "identity" && <Identity />}
          {view === "diagnostics" && <Diagnostics status={status} />}
          {view === "preferences" && <Preferences />}
        </div>
      </main>
      {toast && <div className="toast"><BadgeCheck /><div><strong>Saved</strong><span>{toast}</span></div></div>}
    </div>
  );
}

function Overview({ status, activePhase, completedPhases, onConnect, onOpenLab }: { status: Status; activePhase: ConnectionPhase | null; completedPhases: ConnectionPhase[]; onConnect: () => void; onOpenLab: () => void }) {
  const connected = status === "connected";
  return <><section className="status-panel"><div className="connect-zone"><div className="status-heading"><span className={`status-indicator ${status}`} />{connected ? "Connected · MASQUE H2" : status === "scanning" ? "Testing candidates" : "Ready to search"}<Badge>SOCKS5</Badge></div><h2>{connected ? <>A healthy route<br />is active.</> : status === "scanning" ? <>Testing real paths,<br />not just handshakes.</> : <>Find the route that works<br />on this network.</>}</h2><p>{connected ? "MASQUE H2 · 162.159.192.18:443 · fragmented TLS · IPv4" : "WhiteAesther validates real data paths, remembers healthy edges, and keeps advanced transport controls close by."}</p><Button size="large" onClick={onConnect}><ScanSearch />{connected ? "Disconnect" : status === "scanning" ? "Scanning…" : "Find best connection"}<kbd>Ctrl ↵</kbd></Button><small className="privacy"><LockKeyhole />Testing stays local. No traffic history leaves this device.</small></div><div className="route-card"><div className="section-head"><div><span className="label">SEARCH STRATEGY</span><h3>Adaptive · Iran</h3></div><button onClick={onOpenLab}>Tune</button></div><div className="route-stack">{(["h2", "h3", "wg"] as ConnectionPhase[]).map((phase, index) => { const isActive = activePhase === phase; const isDone = completedPhases.includes(phase); return <div className={`route-step ${isActive ? "testing" : ""} ${isDone ? "passed" : ""}`} key={phase}><span>0{index + 1}</span><div><strong>{phaseCopy[phase].label}</strong><small>{phaseCopy[phase].detail}</small></div><em>{isActive ? "TESTING" : isDone ? index === 0 ? "WINNER" : "READY" : index === 0 ? "FIRST" : "NEXT"}</em></div>; })}</div><div className="roadmap"><Command /><div><strong>Smart failover is planned</strong><span>The current core runs one chosen transport at a time.</span></div><Badge tone="roadmap">ROADMAP</Badge></div></div></section>
    <section className="metric-grid"><Metric icon={Clock3} value={connected ? "84 ms" : "—"} label="Route latency" note="−18 ms" /><Metric icon={PackageCheck} value={connected ? "0.8%" : "—"} label="Packet loss" note="LIVE PROBE" /><Metric icon={TimerReset} value="2.0 s" label="Recovery delay" note="CACHED" /><Metric icon={Network} value="127.0.0.1:1819" label="SOCKS endpoint" note="LOCAL" /></section>
    <section className="dashboard-grid"><article className="card profile-card"><div className="section-head"><div><span className="label">ACTIVE PROFILE</span><h3>Adaptive · Iran</h3></div><Badge tone="current">CORE + LAB</Badge></div>{[["IP family","IPv4 + IPv6"],["Scan depth","Balanced"],["Validation","Real HTTP · 10 s"],["Reconnect","Last healthy edge"]].map(([a,b])=><div className="profile-row" key={a}><span>{a}</span><strong>{b}</strong></div>)}<Button variant="secondary" full onClick={onOpenLab}>Open Connection Lab<ArrowRight /></Button></article><article className="card"><div className="section-head"><div><span className="label">NETWORK SNAPSHOT</span><h3>Current environment</h3></div></div><div className="network-path"><PathNode icon={Laptop} label="This device" active /><span /><PathNode icon={CloudCog} label="Edge pending" /><span /><PathNode icon={Globe2} label="Internet" /></div><div className="signal"><span>Network change detection</span><strong>Watching</strong></div><div className="signal"><span>Data-plane validation</span><strong>Enabled</strong></div></article></section></>;
}

function ConnectionLab({ command, onRun }: { command: string; onRun: () => void }) {
  const presets = ["Adaptive · Iran", "Lossy Mobile", "UDP Blocked", "Manual Expert"];
  const [selected, setSelected] = useState(presets[0]);
  return <><PageIntro badge="CORE-AWARE" title="Connection Lab" copy="Start with a behavior preset, then override only what this network needs." action={<Button onClick={onRun}><ScanSearch />Run strategy</Button>} /><div className="preset-grid">{presets.map((item, index)=><button key={item} className={`preset ${selected===item?"selected":""}`} onClick={()=>setSelected(item)}><FlaskConical /><strong>{item}</strong><span>{["TCP-first selection with full validation.","Fast recovery for unstable mobile links.","H2 with ClientHello fragmentation.","Pin every peer, port and deadline."][index]}</span><small>{index===0?"RECOMMENDED":"PROFILE"}</small></button>)}</div><div className="two-col"><article className="card"><div className="section-head"><div><span className="label">ORDER & RECOVERY</span><h3>Transport strategy</h3></div><Badge tone="roadmap">ROADMAP SUPERVISOR</Badge></div>{(["MASQUE over HTTP/2","MASQUE over HTTP/3","WireGuard + Noize","WARP in WARP"] as const).map((name,index)=><div className="strategy" key={name}><span className={`protocol p${index}`}>{["H2","H3","WG","WiW"][index]}</span><div><strong>{name}</strong><small>{["Best when UDP is filtered","Lower overhead when QUIC survives","Port and profile sweep","Nested tunnel fallback"][index]}</small></div><Switch defaultChecked={index<3} aria-label={`Enable ${name}`} /></div>)}</article><article className="card command-card"><div className="section-head"><div><span className="label">WHAT WILL RUN</span><h3>Core command</h3></div><Badge tone="current">LIVE</Badge></div><pre>{command}</pre><p>The supervisor will map desktop settings to stable core arguments and environment variables.</p><Button variant="secondary" full>Copy command</Button></article></div><GlobalTuning /></>;
}

function Discovery() { return <><PageIntro badge="CORE TODAY" title="Endpoint discovery" copy="Control search coverage, concurrency and how candidates earn a place in the cache." /><div className="two-col"><SettingsCard title="Coverage and budget" label="SCAN POLICY" fields={["Probe parallelism · 24 workers","Candidate budget · 600 endpoints","Per-probe timeout · 1,500 ms","Address family · IPv4 + IPv6"]}/><SettingsCard title="Winner criteria" label="ACCEPTANCE" fields={["Maximum latency · 800 ms","Maximum loss · 20%","Successful checks · 2 of 3","Ranking · Reliability first"]}/></div><SettingsCard title="Ports to test per transport" label="PORT MATRIX" fields={["MASQUE H3 · 443, 8443, 2053, 2083, 2087, 2096","MASQUE H2 · 443, 8443, 2053, 2083, 2087, 2096","WireGuard · 2408, 500, 1701, 4500, 946, 987, 3581"]}/></> }
function Transports() { return <><PageIntro badge="CORE TODAY" title="Transport controls" copy="Protocol-specific controls for every path exposed by the core." /><div className="settings-grid"><SettingsCard title="MASQUE H2" label="TCP" fields={["ECH · Auto","TLS groups · P-256:X25519:P-384","Fragment size · 16–32 bytes","Fragment delay · 2–10 ms"]}/><SettingsCard title="MASQUE H3" label="QUIC" fields={["ECH · Auto","Idle timeout · 120 sec","Migration · Network handoff","Data-plane health · Planned"]}/><SettingsCard title="WireGuard" label="UDP" fields={["Keepalive · 5 sec","Noize · Balanced","Handshake attempts · 3","Endpoint cooldown · 300 sec"]}/><SettingsCard title="WARP in WARP" label="NESTED" fields={["Outer peer · Auto","Inner identity · Default","MTU · Auto","Outer Noize · Balanced"]}/></div></> }
function Routing() { return <><PageIntro badge="CORE TODAY" title="Routing & DNS" copy="Choose what enters the tunnel, stays direct, or never reaches the network." /><div className="settings-grid"><SettingsCard title="Block" label="NEVER SEND" fields={["keyword:doubleclick","port:25","regexp:^ad[0-9]+"]}/><SettingsCard title="Direct" label="BYPASS TUNNEL" fields={["private","10.0.0.0/8","full:router.local"]}/><SettingsCard title="Tunnel" label="DEFAULT" fields={["Everything else","DNS · 1.1.1.1, 1.0.0.1","SOCKS · 127.0.0.1:1819"]}/></div></> }
function Identity() { return <><PageIntro badge="CORE TODAY" title="Zero Trust identity" copy="Enroll with an organization and optionally apply Gateway filtering inside the tunnel." /><div className="two-col"><SettingsCard title="Organization enrollment" label="CLOUDFLARE ZERO TRUST" fields={["Team name","Email one-time code","Service token","Existing enrollment JWT"]}/><SettingsCard title="Gateway policy" label="OPTIONAL" fields={["Web filtering · Off","Require identity · On","Credentials · OS vault","Personal fallback · Off"]}/></div></> }
function Diagnostics({ status }: { status: Status }) { return <><PageIntro badge="LOCAL" title="Diagnostics" copy="Connection stages and health signals without exposing credentials." /><div className="metric-grid"><Metric icon={Activity} value="Ready" label="Core status" note="LOCAL"/><Metric icon={Route} value={status === "connected" ? "MASQUE H2" : "None"} label="Current transport" note="SESSION"/><Metric icon={Network} value="0" label="Network changes" note="WATCHING"/><Metric icon={Clock3} value={status === "connected" ? "Just now" : "—"} label="Last scan" note="HISTORY"/></div><article className="card log"><div className="section-head"><div><span className="label">EVENT STREAM</span><h3>Core log</h3></div></div><code>INFO  WhiteAesther desktop shell ready</code><code>INFO  SOCKS frontend configured at 127.0.0.1:1819</code><code>DEBUG waiting for connection strategy</code></article></> }
function Preferences() { const [platform,setPlatform]=useState("Windows"); return <><PageIntro badge="DESKTOP SHELL" title="Preferences" copy="Cross-platform behavior around the same Rust connection core." /><div className="platforms">{["Windows","macOS","Linux"].map(name=><button className={platform===name?"active":""} onClick={()=>setPlatform(name)} key={name}>{name}</button>)}</div><div className="two-col"><SettingsCard title={`${platform} integration`} label="SYSTEM" fields={["Launch at sign-in · On","Minimize to tray · On","Set system proxy · Off","Full-device tunnel · Roadmap"]}/><SettingsCard title="Application" label="EXPERIENCE" fields={["Theme · Follow system","Density · Comfortable","Update channel · Stable","Language · English"]}/></div></> }
function GlobalTuning() { return <article className="card global"><div className="section-head"><div><span className="label">GLOBAL TUNING</span><h3>Selection and validation</h3></div></div><div className="field-grid">{["IP family\nIPv4 + IPv6","Scan mode\nBalanced","Validation\nReal HTTP request","Validation deadline\n10 sec","Startup deadline\n30 sec","Performance\nAuto-detect","Forced peer\nAutomatic","Last-edge cooldown\n300 sec"].map(item=>{const [a,b]=item.split("\n");return <label key={a}>{a}<span>{b}</span></label>})}</div></article> }
function Metric({ icon: Icon, value, label, note }: { icon: typeof Clock3; value: string; label: string; note: string }) { return <article className="metric"><div><span><Icon /></span><em>{note}</em></div><strong>{value}</strong><small>{label}</small></article> }
function PathNode({ icon: Icon, label, active=false }: { icon: typeof Laptop; label: string; active?: boolean }) { return <div className={`path-node ${active?"active":""}`}><Icon /><small>{label}</small></div> }
function PageIntro({ badge, title, copy, action }: { badge: string; title: string; copy: string; action?: React.ReactNode }) { return <div className="page-intro"><div><Badge tone="current">{badge}</Badge><h2>{title}</h2><p>{copy}</p></div>{action}</div> }
function SettingsCard({ title, label, fields }: { title: string; label: string; fields: string[] }) { return <article className="card settings-card"><div className="section-head"><div><span className="label">{label}</span><h3>{title}</h3></div></div>{fields.map(field=>{const [name,value]=field.split(" · ");return <div className="setting-row" key={field}>{value?<><span>{name}</span><strong>{value}</strong></>:<code>{name}</code>}</div>})}</article> }

export default App;
