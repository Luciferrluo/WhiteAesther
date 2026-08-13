import { Check, FileText, Power, Search, ShieldAlert, X, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CARRY_OPTIONS, type CarryMode, describeCarry } from "./carry";
import type { ConnectionProfile, CoreProbe, CoreSnapshot } from "@/types";

interface SimpleProps {
  snapshot: CoreSnapshot;
  profile: ConnectionProfile;
  probe: CoreProbe;
  carry: CarryMode;
  onCarry: (mode: CarryMode) => void;
  onToggle: () => void;
  onAdvanced: () => void;
  onRetryStealth: () => void;
  onReport: () => void;
}

const BUSY = new Set(["starting", "scanning", "connecting", "reconnecting"]);

export function Simple(props: SimpleProps) {
  const { snapshot, probe } = props;
  const busy = BUSY.has(snapshot.state);

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-8 py-10">
      <div className="flex w-full max-w-[560px] flex-col gap-6">
        {snapshot.state === "connected" ? (
          <Connected {...props} />
        ) : busy ? (
          <Searching {...props} />
        ) : snapshot.state === "error" ? (
          <Failed {...props} />
        ) : (
          <Idle {...props} available={probe.available} />
        )}
      </div>
    </div>
  );
}

function Heading({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[34px] font-bold leading-[1.1] tracking-tight text-balance">{title}</h1>
      {children ? <p className="text-[15px] leading-relaxed text-muted-foreground">{children}</p> : null}
    </div>
  );
}

function CarryPicker({ carry, onCarry, label }: Pick<SimpleProps, "carry" | "onCarry"> & { label?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {label ? <span className="text-sm font-medium">{label}</span> : null}
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
                "flex flex-col gap-2 rounded-lg border p-3.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                option.disabled
                  ? "cursor-not-allowed border-border/60 opacity-45"
                  : active
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border bg-card hover:bg-accent",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <Icon className={active ? "size-[17px] text-primary" : "size-[17px] text-muted-foreground"} />
                {active ? <Check className="size-[15px] text-primary" /> : null}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold leading-tight">{option.title}</span>
                <span className="text-xs leading-snug text-muted-foreground">
                  {option.disabled ? option.disabledReason : option.detail}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Idle({ carry, onCarry, onToggle, onAdvanced, available }: SimpleProps & { available: boolean }) {
  return (
    <>
      <div className="flex flex-col gap-4">
        <Badge variant="outline" className="gap-2">
          <span className="size-1.5 rounded-full bg-muted-foreground" />
          Not connected
        </Badge>
        <Heading title={<>Find the route that works<br />on this network.</>}>
          WhiteAesther tests real paths out and keeps the first one that actually carries traffic.
        </Heading>
      </div>
      <CarryPicker carry={carry} onCarry={onCarry} label="How your traffic is carried" />
      <Button size="lg" className="w-full" onClick={onToggle} disabled={!available}>
        <Zap />
        {available ? "Connect" : "Aether core not found"}
      </Button>
      <button
        type="button"
        onClick={onAdvanced}
        className="self-start text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Something not working? Open advanced settings
      </button>
    </>
  );
}

function Searching({ snapshot, carry, onCarry, onToggle }: SimpleProps) {
  const attempt = snapshot.attempt;
  // The supervisor's own words when it has them; they carry the countdown.
  const detail = snapshot.statusMessage ?? "Testing paths out of this network.";
  return (
    <>
      <div className="flex flex-col gap-4">
        <Badge variant="warn" className="gap-2">
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
          {attempt > 0 ? `Searching · attempt ${attempt} of ${snapshot.maxAttempts}` : "Searching"}
        </Badge>
        <Heading title={<>Testing paths out<br />of this network.</>}>{detail}</Heading>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3.5">
          <Progress value={attempt > 0 ? Math.min(90, attempt * 12) : 25} />
          <div className="flex flex-col gap-2.5 text-[13px]">
            <Step icon={<Check className="size-[15px] text-primary" />} label="Identity ready" />
            {attempt > 0 ? (
              <Step
                muted
                icon={<X className="size-[15px] text-muted-foreground" />}
                label={`${snapshot.transport === "masque-h2" ? "MASQUE H3" : "MASQUE H2"} — no reply`}
              />
            ) : null}
            <Step
              strong
              icon={<Search className="size-[15px] text-primary" />}
              label={`${transportName(snapshot.transport)} — testing gateways`}
            />
          </div>
        </div>
      </Card>

      <CarryPicker carry={carry} onCarry={onCarry} label="How your traffic is carried" />
      <Button size="lg" variant="outline" className="w-full" onClick={onToggle}>
        Stop
      </Button>
    </>
  );
}

function Step({
  icon,
  label,
  muted,
  strong,
}: {
  icon: React.ReactNode;
  label: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <span className={muted ? "text-muted-foreground" : strong ? "font-medium" : ""}>{label}</span>
    </div>
  );
}

function Connected({ snapshot, profile, carry, onCarry, onToggle, onAdvanced }: SimpleProps) {
  return (
    <>
      <div className="flex flex-col gap-4">
        <Badge variant="ok" className="gap-2">
          <span className="size-1.5 rounded-full bg-current" />
          Connected
        </Badge>
        <Heading title="You're through.">
          Traffic is carried over{" "}
          <span className="font-mono text-sm text-foreground">{transportName(snapshot.transport)}</span>.{" "}
          {describeCarry(carry, snapshot.socksAddress)}
        </Heading>
      </div>

      <Card>
        <div className="flex items-stretch">
          <Readout label="Edge" value={snapshot.endpoint ?? "—"} />
          <Separator orientation="vertical" />
          <Readout label="Latency" value={snapshot.latencyMs == null ? "—" : `${snapshot.latencyMs.toFixed(1)} ms`} />
          <Separator orientation="vertical" />
          <Readout label="Search" value={profile.scanMode} />
        </div>
      </Card>

      <CarryPicker carry={carry} onCarry={onCarry} label="How your traffic is carried" />
      <div className="flex gap-2">
        <Button size="lg" variant="outline" className="flex-1" onClick={onToggle}>
          <Power />
          Disconnect
        </Button>
        <Button size="lg" variant="ghost" onClick={onAdvanced}>
          Details
        </Button>
      </div>
    </>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1 p-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="tabular truncate font-mono text-[15px] font-medium">{value}</span>
    </div>
  );
}

function Failed({ snapshot, onRetryStealth, onReport, onAdvanced }: SimpleProps) {
  return (
    <>
      <div className="flex flex-col gap-4">
        <Badge variant="bad" className="gap-2">
          <span className="size-1.5 rounded-full bg-current" />
          Stopped
        </Badge>
        <Heading title={<>Nothing got out<br />of this network.</>}>
          {snapshot.lastError ?? "Every path was refused."}
        </Heading>
      </div>

      <Alert variant="warning">
        <ShieldAlert />
        <AlertTitle>Three things to try, in order</AlertTitle>
        <AlertDescription>
          <div className="mt-1.5 flex flex-col gap-1">
            <span>
              <b className="text-foreground">1</b>&nbsp; Switch search depth to <b className="text-foreground">Stealth</b> —
              quieter probing, slower to connect
            </span>
            <span>
              <b className="text-foreground">2</b>&nbsp; Set addresses to <b className="text-foreground">IPv4 only</b> if
              this network handles IPv6 badly
            </span>
            <span>
              <b className="text-foreground">3</b>&nbsp; Turn obfuscation up to{" "}
              <b className="text-foreground">Aggressive</b>
            </span>
          </div>
        </AlertDescription>
      </Alert>

      <div className="flex gap-2">
        <Button size="lg" className="flex-1" onClick={onRetryStealth}>
          <Zap />
          Try again with Stealth
        </Button>
        <Button size="lg" variant="outline" onClick={onReport}>
          <FileText />
          Report
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Or{" "}
        <button type="button" onClick={onAdvanced} className="underline underline-offset-4 hover:text-foreground">
          open Advanced
        </button>{" "}
        to change the transport and endpoint yourself.
      </p>
    </>
  );
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
