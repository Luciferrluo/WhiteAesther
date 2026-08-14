import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Search, Settings2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Advanced } from "@/features/Advanced";
import { Simple } from "@/features/Simple";
import { type CarryMode, carryFromProfile } from "@/features/carry";
import { SAMPLE_MS, type Sample, append } from "@/features/latency";
import logo from "@/assets/logo.png";
import {
  getCoreLogs, getCoreStatus, isDesktopRuntime, loadProfile, probeCore, probeLatency, runtimeInfo,
  saveProfile as persistProfile, setSystemProxy, startCore, stopCore, subscribeCore,
  subscribeTrayActions,
} from "@/core/api";
import { withNormalizedEndpoint } from "@/core/endpoint";
import {
  DEFAULT_PROFILE, IDLE_SNAPSHOT, type ConnectionProfile, type CoreLogEvent, type CoreProbe,
  type CoreSnapshot,
} from "@/types";

const ACTIVE = new Set(["starting", "scanning", "connecting", "connected", "reconnecting"]);
const MODE_KEY = "whiteaesther.mode";
const appVersion = import.meta.env.VITE_APP_VERSION || "1.0.0";

type Mode = "simple" | "advanced";
type Toast = { title: string; message: string; error?: boolean };

export default function App() {
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem(MODE_KEY) as Mode | null) ?? "simple",
  );
  const [profile, setProfile] = useState<ConnectionProfile>(DEFAULT_PROFILE);
  const [snapshot, setSnapshot] = useState<CoreSnapshot>(IDLE_SNAPSHOT);
  const [probe, setProbe] = useState<CoreProbe>({
    available: false, path: null, version: null, message: "Checking core…",
  });
  const [logs, setLogs] = useState<CoreLogEvent[]>([]);
  const [runtime, setRuntime] = useState("Desktop shell");
  const [toast, setToast] = useState<Toast | null>(null);
  const [latency, setLatency] = useState<Sample[]>([]);

  const desktop = isDesktopRuntime();
  const effective = useMemo(() => withNormalizedEndpoint(profile), [profile]);

  const notify = useCallback((title: string, message: string, error?: boolean) => {
    setToast({ title, message, error });
  }, []);
  const showError = useCallback(
    (error: unknown) => notify("Action failed", error instanceof Error ? error.message : String(error), true),
    [notify],
  );

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      if (!desktop) {
        setRuntime("Browser preview");
        setProbe({ available: false, path: null, version: null, message: "Open the desktop app to control Aether." });
        return;
      }
      try {
        // Subscribe first, then settle the rest independently: with Promise.all, one rejection
        // (loadProfile throws on any stored profile that fails validation) skipped subscribeCore
        // too, leaving the app blind to a running core for the whole session.
        unsubscribe = await subscribeCore(
          (next) => { if (!disposed) setSnapshot(next); },
          (entry) => { if (!disposed) setLogs((current) => [...current.slice(-999), entry]); },
        );
        if (disposed) return;
        const [info, saved, current, history] = await Promise.allSettled([runtimeInfo(), loadProfile(), getCoreStatus(), getCoreLogs()]);
        if (disposed) return;
        if (info.status === "fulfilled") setRuntime(`${info.value.os} · ${info.value.arch}`);
        if (saved.status === "fulfilled") setProfile(saved.value);
        if (current.status === "fulfilled") setSnapshot(current.value);
        if (history.status === "fulfilled") setLogs(history.value);
        if (saved.status === "rejected") showError(saved.reason);
        setProbe(await probeCore(saved.status === "fulfilled" ? saved.value : DEFAULT_PROFILE));
      } catch (error) {
        if (!disposed) showError(error);
      }
    })();
    return () => { disposed = true; unsubscribe?.(); };
  }, [desktop, showError]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // The round-trip series behind the status chart. Only runs while a tunnel is
  // up, and the history is thrown away on disconnect: samples from the previous
  // route say nothing about the next one.
  useEffect(() => {
    if (!desktop || snapshot.state !== "connected") {
      setLatency([]);
      return;
    }
    let disposed = false;
    let timer = 0;

    const sample = async () => {
      try {
        const value = await probeLatency();
        if (!disposed) setLatency((history) => append(history, value));
      } catch {
        // A probe that throws is a probe that failed; the gap in the chart says
        // so, and a toast for every five seconds of a bad route would be noise.
        if (!disposed) setLatency((history) => append(history, null));
      }
      if (!disposed) timer = window.setTimeout(() => void sample(), SAMPLE_MS);
    };
    void sample();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [desktop, snapshot.state]);

  const toggleConnection = useCallback(async () => {
    try {
      if (ACTIVE.has(snapshot.state)) {
        setSnapshot(await stopCore());
        notify("Disconnected", "The core stopped cleanly.");
        return;
      }
      const latest = await probeCore(effective);
      setProbe(latest);
      if (!latest.available) throw new Error(latest.message);
      setSnapshot(await startCore(effective));
    } catch (error) {
      showError(error);
    }
  }, [snapshot.state, effective, notify, showError]);

  // Held in a ref so the listeners below never need re-registering. Depending on
  // the callback itself tore down and rebuilt a Tauri listener over IPC on every
  // keystroke, and re-bound the shortcut handler on every render.
  const toggleRef = useRef(toggleConnection);
  useEffect(() => {
    toggleRef.current = toggleConnection;
  }, [toggleConnection]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void toggleRef.current();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMode("advanced");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void subscribeTrayActions((action) => {
      if (disposed) return;
      if (action === "open-diagnostics") setMode("advanced");
      else if (action === "restore-proxy") {
        void stopCore()
          .then((next) => {
            setSnapshot(next);
            notify("Connection restored", "Your system proxy has been put back.");
          })
          .catch(showError);
      } else void toggleRef.current();
    })
      .then((cleanup) => { if (disposed) cleanup(); else unsubscribe = cleanup; })
      .catch(showError);
    return () => { disposed = true; unsubscribe?.(); };
  }, [desktop, notify, showError]);

  const saveProfile = useCallback(async () => {
    try {
      if (!desktop) {
        localStorage.setItem("whiteaesther-profile", JSON.stringify(profile));
      } else {
        const saved = await persistProfile(effective);
        setProfile((current) => ({
          ...saved,
          accessClientSecret: current.accessClientSecret,
          accessToken: current.accessToken,
        }));
      }
      notify("Profile saved", "Settings are stored locally on this device.");
    } catch (error) {
      showError(error);
    }
  }, [desktop, profile, effective, notify, showError]);

  /**
   * A switch flipped on the Simple screen has to survive the session, so this
   * writes through to disk rather than only to state. The supervisor reads the
   * live session's copy, so both halves are kept in step.
   */
  const applyProfile = useCallback(
    (patch: Partial<ConnectionProfile>) => {
      setProfile((current) => {
        const next = { ...current, ...patch };
        if (desktop) {
          void persistProfile(withNormalizedEndpoint(next)).catch(showError);
        }
        return next;
      });
    },
    [desktop, showError],
  );

  const carry: CarryMode = carryFromProfile(profile.systemProxy);
  const setCarry = useCallback(
    (next: CarryMode) => {
      if (next === "tun") return;
      const wantsSystem = next === "system";
      setProfile((current) => ({ ...current, systemProxy: wantsSystem }));
      // The screen offers this choice while connected, so it has to take effect
      // then, rather than only at the next connect.
      if (!desktop || !ACTIVE.has(snapshot.state)) return;
      void setSystemProxy(wantsSystem)
        .then((applied) => {
          if (wantsSystem && applied) notify("Whole machine", "Your system proxy now points at the tunnel.");
          else if (!wantsSystem) notify("This app only", "Your system proxy has been put back.");
        })
        .catch(showError);
    },
    [desktop, snapshot.state, notify, showError],
  );

  const retryStealth = useCallback(async () => {
    const next: ConnectionProfile = { ...profile, scanMode: "stealth" };
    setProfile(next);
    try {
      setSnapshot(await startCore(withNormalizedEndpoint(next)));
    } catch (error) {
      showError(error);
    }
  }, [profile, showError]);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-[56px] shrink-0 items-center justify-between border-b bg-[linear-gradient(180deg,hsl(var(--card-top)),hsl(var(--card)))] px-[18px] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.03)]">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="" className="size-[26px] rounded-[7px]" />
          <span className="text-[14.5px] font-semibold tracking-tight">WhiteAesther</span>
          <StateChip snapshot={snapshot} />
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMode("advanced")}
            className="flex h-8 items-center gap-1.5 rounded-lg border bg-muted px-2.5 text-[12px]
              text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="size-[13px]" />
            <span>Search settings</span>
            <kbd className="rounded border bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
              Ctrl K
            </kbd>
          </button>
          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList className="h-8">
              <TabsTrigger value="simple" className="px-3 py-1 text-[13px]">Simple</TabsTrigger>
              <TabsTrigger value="advanced" className="px-3 py-1 text-[13px]">Advanced</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="icon" aria-label="Advanced settings" onClick={() => setMode("advanced")}>
            <Settings2 />
          </Button>
        </div>
      </header>

      {snapshot.blocking ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-warning/30 bg-warning/[0.09] px-[18px] py-2.5">
          <ShieldAlert className="size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-warning">Traffic is blocked, not broken</div>
            <div className="truncate text-[11.5px] text-muted-foreground">
              {snapshot.statusMessage ??
                "The tunnel is down and your system proxy still points at it, so nothing leaves in the clear."}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={async () => {
              try {
                setSnapshot(await stopCore());
                notify("Connection restored", "Your system proxy has been put back.");
              } catch (error) {
                showError(error);
              }
            }}
          >
            Restore my connection
          </Button>
        </div>
      ) : null}

      <main className="min-h-0 flex-1">
        {mode === "simple" ? (
          <Simple
            snapshot={snapshot}
            profile={profile}
            probe={probe}
            carry={carry}
            latency={latency}
            onCarry={setCarry}
            onToggle={() => void toggleConnection()}
            onAdvanced={() => setMode("advanced")}
            onRetryStealth={() => void retryStealth()}
            onReport={() => setMode("advanced")}
            onProfile={applyProfile}
            onToast={notify}
          />
        ) : (
          <Advanced
            profile={profile}
            onChange={setProfile}
            snapshot={snapshot}
            probe={probe}
            logs={logs}
            runtime={runtime}
            appVersion={appVersion}
            onSave={() => void saveProfile()}
            onToast={notify}
          />
        )}
      </main>

      <Credits engineVersion={probe.version} />

      {toast ? (
        <div
          role="status"
          className={[
            "fixed bottom-5 right-5 z-50 flex max-w-[420px] items-start gap-2.5 rounded-lg border bg-popover p-3.5 shadow-lg",
            toast.error ? "border-destructive/50" : "border-border",
          ].join(" ")}
        >
          <BadgeCheck className={toast.error ? "size-4 text-destructive" : "size-4 text-primary"} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-semibold">{toast.title}</span>
            <span className="break-words text-xs text-muted-foreground">{toast.message}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StateChip({ snapshot }: { snapshot: CoreSnapshot }) {
  if (snapshot.state === "connected")
    return (
      <span className="ml-1.5 inline-flex h-[22px] items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.13] px-2.5 text-[11.5px] font-semibold text-primary">
        <span className="size-1.5 rounded-full bg-current" />
        Connected
      </span>
    );
  if (snapshot.state === "error")
    return (
      <span className="ml-1.5 inline-flex h-[22px] items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 text-[11.5px] font-semibold text-destructive">
        <span className="size-1.5 rounded-full bg-current" />
        Stopped
      </span>
    );
  if (!ACTIVE.has(snapshot.state))
    return (
      <span className="ml-1.5 inline-flex h-[22px] items-center gap-1.5 rounded-full border bg-muted px-2.5 text-[11.5px] font-semibold text-muted-foreground">
        <span className="size-1.5 rounded-full bg-current" />
        Not connected
      </span>
    );
  return (
    <span className="ml-1.5 inline-flex h-[22px] items-center gap-1.5 rounded-full border border-warning/30 bg-warning/[0.13] px-2.5 text-[11.5px] font-semibold text-warning">
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      {snapshot.attempt > 0 ? `Searching · ${snapshot.attempt} of ${snapshot.maxAttempts}` : "Searching"}
    </span>
  );
}

/**
 * Version, engine build, licence and source — the same facts the Android client
 * puts on its About screen. AGPL-3.0 obliges us to tell people where the source
 * for the build they are running lives, so this is not decoration.
 */
function Credits({ engineVersion }: { engineVersion: string | null }) {
  return (
    <footer className="flex h-[34px] shrink-0 items-center justify-between border-t bg-sidebar-foot px-[18px] text-[11.5px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2.5">
        <img src={logo} alt="" className="size-3.5 rounded opacity-85" />
        <span>
          WhiteAesther <b className="font-semibold text-foreground/70">{appVersion}</b>
        </span>
        <Rule />
        <span className="truncate">
          engine <span className="tabular font-mono">{engineVersion ?? "unavailable"}</span>
        </span>
        <Rule />
        <span>AGPL-3.0</span>
        <Rule />
        <span className="truncate font-mono">github.com/WhiteDNS/WhiteAesther</span>
      </div>
      <span className="shrink-0">Built on the Aether engine</span>
    </footer>
  );
}

function Rule() {
  return <span className="text-border-strong">|</span>;
}
