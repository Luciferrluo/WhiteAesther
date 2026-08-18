import { useEffect, useState } from "react";
import { Check, FileText, Gauge, Globe, Lock, Plug, Power, Radar, Search, ShieldAlert, X, Zap, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { type ExitInfo, exitInfo, speedTest } from "@/core/api";
import { ConnectOrb, type OrbState } from "./ConnectOrb";
import { Sparkline } from "./Sparkline";
import { type Sample, summarise } from "./latency";
import { CARRY_OPTIONS, type CarryMode, describeCarry } from "./carry";
import type { ConnectionProfile, CoreProbe, CoreSnapshot } from "@/types";

interface SimpleProps {
  snapshot: CoreSnapshot;
  profile: ConnectionProfile;
  probe: CoreProbe;
  carry: CarryMode;
  latency: Sample[];
  onCarry: (mode: CarryMode) => void;
  onToggle: () => void;
  onAdvanced: () => void;
  onRetryStealth: () => void;
  onReport: () => void;
  onProfile: (patch: Partial<ConnectionProfile>) => void;
  onToast: (title: string, message: string, error?: boolean) => void;
}

const BUSY = new Set(["starting", "scanning", "connecting", "reconnecting"]);

export function Simple(props: SimpleProps) {
  const { snapshot, probe } = props;
  const busy = BUSY.has(snapshot.state);
  const failed = snapshot.state === "error";
  const live = snapshot.state === "connected";

  const orbState: OrbState = live ? "live" : busy ? "working" : failed ? "failed" : "idle";
  const caption = live ? "Connected" : busy ? "Searching" : failed ? "Stopped" : "Tap to connect";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 gap-5 px-5 pt-5">
        <aside
          className={[
            "flex w-[386px] shrink-0 flex-col items-center justify-center rounded-xl border",
            live ? "bg-[radial-gradient(120%_80%_at_50%_30%,hsl(var(--primary)/0.055),transparent_70%)]" : "",
            busy ? "bg-[radial-gradient(120%_80%_at_50%_30%,hsl(var(--warning)/0.05),transparent_70%)]" : "",
          ].join(" ")}
        >
          <ConnectOrb
            state={orbState}
            caption={caption}
            disabled={!probe.available && !live && !busy}
            onClick={props.onToggle}
          />
          <Headline {...props} />
          <Actions {...props} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          {live ? <Connected {...props} /> : null}
          {busy ? <Searching {...props} /> : null}
          {failed ? <Failed {...props} /> : null}
          {!live && !busy && !failed ? <Idle {...props} /> : null}
        </div>
      </div>

      <div className="px-5 pb-4 pt-3.5">
        <CarryPicker carry={props.carry} onCarry={props.onCarry} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the panel

function Headline({ snapshot, carry, probe }: SimpleProps) {
  const live = snapshot.state === "connected";
  const busy = BUSY.has(snapshot.state);
  const failed = snapshot.state === "error";

  const title = live ? "You're through" : busy ? "Testing paths out" : failed ? "Nothing got out" : "Ready when you are";
  const detail = live
    ? `${transportName(snapshot.transport)} · ${describeCarry(carry, snapshot.socksAddress)}`
    : busy
      ? (snapshot.statusMessage ?? "Testing paths out of this network.")
      : failed
        ? (snapshot.lastError ?? "Every path was refused.")
        : probe.available
          ? "WhiteAesther finds a route that works here."
          : probe.message;

  return (
    <div className="mt-4 max-w-[320px] text-center">
      <div className="text-[23px] font-bold leading-tight tracking-tight">{title}</div>
      <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-muted-foreground">{detail}</p>
    </div>
  );
}

/**
 * Runs a real download through the tunnel and keeps the figure on the button.
 *
 * Disabled while it runs, because a second download competing with the first
 * would make both of them read slow.
 */
function SpeedTest({ onToast }: Pick<SimpleProps, "onToast">) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  return (
    <Button
      variant="outline"
      className="h-9 px-4"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { mbps, seconds } = await speedTest();
          setResult(mbps);
          onToast("Speed test", `${mbps.toFixed(1)} Mbps down, over ${seconds.toFixed(1)} s.`);
        } catch (error) {
          setResult(null);
          onToast("Speed test failed", error instanceof Error ? error.message : String(error), true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Gauge className={busy ? "animate-spin" : undefined} />
      {busy ? "Measuring…" : result == null ? "Speed test" : `${result.toFixed(1)} Mbps`}
    </Button>
  );
}

function Actions({ snapshot, probe, onToggle, onRetryStealth, onToast }: SimpleProps) {
  const live = snapshot.state === "connected";
  const busy = BUSY.has(snapshot.state);
  const failed = snapshot.state === "error";

  if (busy)
    return (
      <Button variant="outline" className="mt-5 h-9 px-7" onClick={onToggle}>
        Stop
      </Button>
    );
  if (live)
    return (
      <div className="mt-5 flex gap-2.5">
        <Button variant="outline" className="h-9 px-5" onClick={onToggle}>
          <Power />
          Disconnect
        </Button>
        <SpeedTest onToast={onToast} />
      </div>
    );
  if (failed)
    return (
      <Button className="mt-5 h-9 px-5" onClick={onRetryStealth}>
        <Zap />
        Try again with Stealth
      </Button>
    );
  return (
    <>
      <Button size="lg" className="mt-5 h-11 px-11 text-[14.5px]" onClick={onToggle} disabled={!probe.available}>
        <Zap className="size-[17px]" />
        {probe.available ? "Connect" : "Aether core not found"}
      </Button>
      <p className="mt-2.5 text-[11px] text-muted-foreground">
        or press <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd>
      </p>
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-semibold text-foreground">
      {children}
    </kbd>
  );
}

// -------------------------------------------------------------------- content

function Connected({ snapshot, profile, latency, onProfile }: SimpleProps) {
  const summary = summarise(latency);
  const shown = summary.last ?? snapshot.latencyMs;

  return (
    <>
      <div className="grid grid-cols-4 gap-2.5">
        <Tile label="Edge" value={snapshot.endpoint ?? "—"} />
        <Tile label="Transport" value={transportName(snapshot.transport)} plain />
        <Tile label="Latency" value={shown == null ? "—" : `${Math.round(shown)} ms`} good />
        <Uptime startedAt={snapshot.startedAt} />
      </div>

      <Card className="surface flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[13px] font-semibold">Round-trip through the tunnel</h3>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Measured every 5 s through the tunnel. Last 80 seconds.
            </p>
          </div>
          <div className="flex shrink-0 gap-3.5 text-right">
            <Figure label="min" value={summary.min == null ? "—" : Math.round(summary.min)} />
            <Figure label="avg" value={summary.avg == null ? "—" : Math.round(summary.avg)} />
            <Figure label="max" value={summary.max == null ? "—" : Math.round(summary.max)} />
            <Figure
              label="loss"
              value={`${Math.round(summary.loss * 100)}%`}
              tone={summary.loss > 0 ? "bad" : "good"}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-1 items-end">
          {latency.length ? (
            <Sparkline history={latency} height={280} />
          ) : (
            <div className="grid h-full w-full place-items-center text-[12.5px] text-muted-foreground">
              Taking the first measurement…
            </div>
          )}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-muted-foreground">
          <span>-80s</span>
          <span>-60s</span>
          <span>-40s</span>
          <span>-20s</span>
          <span>now</span>
        </div>
      </Card>

      <ExitCard />

      <Card className="surface flex items-center gap-3.5 p-3">
        <Toggle
          icon={Plug}
          label="Keep me connected"
          help="Reconnect automatically if the route drops"
          checked={profile.autoReconnect}
          onChange={(autoReconnect) => onProfile({ autoReconnect })}
        />
        <div className="h-8 w-px shrink-0 bg-border" />
        <Toggle
          icon={Lock}
          label="Block traffic if the tunnel drops"
          help={
            profile.killSwitch
              ? "Apps fail closed. Disconnect to put the proxy back."
              : "Apps fail closed instead of leaking"
          }
          checked={profile.killSwitch}
          onChange={(killSwitch) => onProfile({ killSwitch })}
        />
      </Card>
    </>
  );
}

/**
 * The address the rest of the internet sees.
 *
 * The Edge tile shows which Cloudflare gateway the tunnel connects *to*, which
 * people read as the address they appear *from* -- they are not the same, and
 * WARP is explicit that it does not move you to another country. Showing the
 * real exit address settles that question instead of leaving it to guesswork.
 */
function ExitCard() {
  const [info, setInfo] = useState<ExitInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setInfo(null);
    setError(null);
    void exitInfo()
      .then((next) => { if (!disposed) setInfo(next); })
      .catch((reason) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => { disposed = true; };
  }, []);

  return (
    <Card className="surface flex items-center gap-3.5 p-3.5">
      <div
        className={[
          "grid size-[34px] shrink-0 place-items-center rounded-lg",
          info?.warp ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        <Globe className="size-[17px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold">What websites see</div>
        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {error
            ? error
            : info
              ? `${info.ip} · ${info.country}${info.colo ? ` · via ${info.colo}` : ""}`
              : "Checking…"}
        </div>
      </div>
      {info ? (
        <span
          className={[
            "shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold",
            info.warp
              ? "border-primary/30 bg-primary/[0.11] text-primary"
              : "border-warning/40 bg-warning/[0.11] text-warning",
          ].join(" ")}
        >
          {info.warp ? "Through the tunnel" : "Not through the tunnel"}
        </span>
      ) : null}
    </Card>
  );
}

function Toggle({
  icon: Icon,
  label,
  help,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  help: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div
        className={[
          "grid size-[30px] shrink-0 place-items-center rounded-lg",
          checked ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        <Icon className="size-[15px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold">{label}</div>
        <div className="mt-px truncate text-[11px] text-muted-foreground">{help}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Searching({ snapshot }: SimpleProps) {
  const attempt = snapshot.attempt;
  return (
    <Card className="surface flex flex-1 flex-col p-4">
      <h3 className="text-[13px] font-semibold">What it is trying</h3>
      <Progress className="mt-3" value={attempt > 0 ? Math.min(90, attempt * 12) : 25} />
      <div className="mt-4 flex flex-col">
        <Step done icon={<Check className="size-3.5" />} label="Device identity ready" />
        {attempt > 0 ? (
          <Step
            icon={<X className="size-3.5" />}
            label={`${snapshot.transport === "masque-h2" ? "MASQUE H3" : "MASQUE H2"} — no reply`}
          />
        ) : null}
        <Step
          active
          icon={<Radar className="size-3.5" />}
          label={`${transportName(snapshot.transport)} — testing gateways`}
        />
      </div>
      <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/[0.06] p-2.5">
        <Search className="size-3.5 shrink-0 text-primary" />
        <span className="text-[12px] text-muted-foreground">
          Retries alternate the two MASQUE transports on their own. Nothing to do.
        </span>
      </div>
      {attempt > 0 ? (
        <p className="mt-auto pt-3 text-[12px] text-muted-foreground">
          Attempt {attempt} of {snapshot.maxAttempts}.
        </p>
      ) : null}
    </Card>
  );
}

function Step({
  icon,
  label,
  done,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b py-2.5 last:border-b-0">
      <span
        className={[
          "grid size-6 shrink-0 place-items-center rounded-full",
          done ? "bg-primary/15 text-primary" : active ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className={`text-[13px] ${done || active ? "" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

function Idle({ snapshot, profile }: SimpleProps) {
  return (
    <Card className="surface flex flex-1 flex-col p-4">
      <h3 className="text-[13px] font-semibold">What will happen</h3>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        The route is found for you. These are the settings it will start from.
      </p>
      <div className="mt-3.5 flex flex-col">
        <Fact label="Protocol" value={transportName(snapshot.transport ?? "masque-h2")} />
        <Fact label="Search depth" value={profile.scanMode} />
        <Fact label="Addresses" value={profile.ipFamily === "both" ? "IPv4 and IPv6" : profile.ipFamily} />
        <Fact
          label="Gateway"
          value={profile.endpointMode === "automatic" ? "found automatically" : (profile.peer ?? "pinned")}
        />
        <Fact label="Local proxy" value={profile.socksAddress} />
      </div>
      <p className="mt-auto pt-3 text-[12px] text-muted-foreground">
        Retries alternate MASQUE H2 and H3 automatically, up to {snapshot.maxAttempts} attempts.
      </p>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span className="tabular truncate font-mono text-[12.5px]">{value}</span>
    </div>
  );
}

function Failed({ onReport, onAdvanced }: SimpleProps) {
  return (
    <Card className="surface flex flex-1 flex-col p-4">
      <Alert variant="warning">
        <ShieldAlert />
        <AlertTitle>Three things to try, in order</AlertTitle>
        <AlertDescription>
          <div className="mt-1.5 flex flex-col gap-1">
            <span>
              <b className="text-foreground">1</b>&nbsp; Switch search depth to{" "}
              <b className="text-foreground">Stealth</b> — quieter probing, slower to connect
            </span>
            <span>
              <b className="text-foreground">2</b>&nbsp; Set addresses to{" "}
              <b className="text-foreground">IPv4 only</b> if this network handles IPv6 badly
            </span>
            <span>
              <b className="text-foreground">3</b>&nbsp; Turn obfuscation up to{" "}
              <b className="text-foreground">Aggressive</b>
            </span>
          </div>
        </AlertDescription>
      </Alert>
      <div className="mt-auto flex gap-2 pt-4">
        <Button variant="outline" className="flex-1" onClick={onReport}>
          <FileText />
          Build a report
        </Button>
        <Button variant="ghost" onClick={onAdvanced}>
          Open Advanced
        </Button>
      </div>
    </Card>
  );
}

// --------------------------------------------------------------------- pieces

function Tile({ label, value, plain, good }: { label: string; value: string; plain?: boolean; good?: boolean }) {
  return (
    <Card className="surface p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">{label}</div>
      <div
        className={[
          "mt-1 truncate text-[16px] font-semibold",
          plain ? "" : "tabular font-mono",
          good ? "text-primary" : "",
        ].join(" ")}
      >
        {value}
      </div>
    </Card>
  );
}

/** Ticks in its own component so the rest of the page does not re-render every second. */
function Uptime({ startedAt }: { startedAt: number | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (startedAt == null) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return <Tile label="Uptime" value={formatUptime(startedAt)} />;
}

function Figure({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">{label}</div>
      <div
        className={[
          "tabular mt-0.5 font-mono text-[13px]",
          tone === "good" ? "text-primary" : tone === "bad" ? "text-warning" : "",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function CarryPicker({ carry, onCarry }: Pick<SimpleProps, "carry" | "onCarry">) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {CARRY_OPTIONS.map((option) => {
        const active = carry === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            disabled={option.disabled}
            aria-pressed={active}
            onClick={() => onCarry(option.id)}
            title={option.disabled ? option.disabledReason : undefined}
            className={[
              "surface flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              option.disabled
                ? "cursor-not-allowed opacity-40"
                : active
                  ? "border-primary/55 bg-primary/[0.09] ring-1 ring-primary/30"
                  : "hover:bg-accent",
            ].join(" ")}
          >
            <div
              className={[
                "grid size-8 shrink-0 place-items-center rounded-[9px]",
                active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              <Icon className="size-[17px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[13.5px] font-semibold">{option.title}</span>
                {active ? <Check className="size-3.5 text-primary" /> : null}
              </div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                {option.disabled ? option.disabledReason : option.detail}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------- utils

export function formatUptime(startedAt: number | null): string {
  if (startedAt == null) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

const TRANSPORT_NAMES: Record<string, string> = {
  "masque-h2": "MASQUE H2",
  "masque-h3": "MASQUE H3",
  wireguard: "WireGuard",
  "warp-in-warp": "WARP in WARP",
};

export function transportName(value: CoreSnapshot["transport"]): string {
  return TRANSPORT_NAMES[value ?? ""] ?? "MASQUE";
}
