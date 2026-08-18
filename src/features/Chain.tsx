import { useCallback, useEffect, useState } from "react";
import { Link2, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Row } from "./panels";
import {
  type ChainNode, chainNodes, chainSelect, chainStatus, chainTest,
} from "@/core/api";
import type { ChainSource, ConnectionProfile } from "@/types";

interface ChainProps {
  profile: ConnectionProfile;
  onChange: (profile: ConnectionProfile) => void;
  connected: boolean;
  onToast: (title: string, message: string, error?: boolean) => void;
}

export function Chain({ profile, onChange, connected, onToast }: ChainProps) {
  const chain = profile.chain;
  const set = (patch: Partial<ConnectionProfile["chain"]>) =>
    onChange({ ...profile, chain: { ...chain, ...patch } });

  const [running, setRunning] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [nodes, setNodes] = useState<ChainNode[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await chainStatus();
      setRunning(status.running);
      setAddress(status.address);
      setNodes(status.running ? await chainNodes() : []);
    } catch {
      // Not running is the ordinary case, not a failure worth a toast.
      setRunning(false);
      setNodes([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, connected]);

  return (
    <>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[15px]">Change the address you appear from</CardTitle>
          <CardDescription>
            The tunnel hides your traffic but keeps your country — Cloudflare places you near where
            you already are. Sending it on through a node of your own is what changes that.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            first
            title="Route through a second hop"
            help="Every node is dialled from inside the tunnel, so this network only ever sees Cloudflare."
          >
            <Switch checked={chain.enabled} onCheckedChange={(enabled) => set({ enabled })} />
          </Row>
          {chain.enabled ? (
            <>
              <Separator />
              <div className="flex items-center gap-2.5 py-3">
                <span
                  className={[
                    "size-1.5 shrink-0 rounded-full",
                    running ? "bg-primary" : connected ? "bg-warning" : "bg-muted-foreground",
                  ].join(" ")}
                />
                <span className="text-[13px] text-muted-foreground">
                  {running
                    ? `Carrying traffic on ${address}`
                    : connected
                      ? "The tunnel is up but the chain is not running — check the log."
                      : "Starts once the tunnel is connected."}
                </span>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Sources sources={chain.sources} onChange={(sources) => set({ sources })} />

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[15px]">Configs pasted by hand</CardTitle>
          <CardDescription>
            One per line. vless, vmess, trojan, ss, hysteria2 and tuic are all understood as they
            are — nothing needs converting first.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <Textarea
            rows={4}
            className="font-mono text-[12.5px]"
            value={chain.manual}
            placeholder={"vless://…\ntrojan://…"}
            onChange={(event) => set({ manual: event.target.value })}
          />
        </CardContent>
      </Card>

      <Nodes
        nodes={nodes}
        running={running}
        selected={chain.node}
        busy={busy}
        onRefresh={refresh}
        onTest={async (node) => {
          setBusy(node.name);
          try {
            const delay = await chainTest(node.source, node.name);
            setNodes((current) =>
              current.map((entry) => (entry.name === node.name ? { ...entry, delay } : entry)),
            );
            if (delay == null) {
              onToast("Not usable", `${node.name} could not be reached through the tunnel.`, true);
            }
          } catch (error) {
            onToast("Test failed", error instanceof Error ? error.message : String(error), true);
          } finally {
            setBusy(null);
          }
        }}
        onSelect={async (node) => {
          setBusy(node.name);
          try {
            await chainSelect(node.name);
            set({ node: node.name });
            onToast("Exit changed", `Traffic now leaves through ${node.name}.`);
          } catch (error) {
            onToast("Could not switch", error instanceof Error ? error.message : String(error), true);
          } finally {
            setBusy(null);
          }
        }}
      />
    </>
  );
}

function Sources({
  sources,
  onChange,
}: {
  sources: ChainSource[];
  onChange: (sources: ChainSource[]) => void;
}) {
  const [url, setUrl] = useState("");

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-[15px]">Subscriptions</CardTitle>
        <CardDescription>
          Kept up to date automatically. A subscription link is a credential — anyone holding it can
          use your nodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-2">
        {sources.length ? (
          <div className="flex flex-col">
            {sources.map((source, index) => (
              <div key={`${source.url}-${index}`} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
                <Switch
                  checked={source.enabled}
                  onCheckedChange={(enabled) =>
                    onChange(sources.map((entry, at) => (at === index ? { ...entry, enabled } : entry)))
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{source.name || "Subscription"}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {redact(source.url)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${source.name}`}
                  onClick={() => onChange(sources.filter((_, at) => at !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No subscriptions yet.</p>
        )}

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <Label className="text-[13.5px]">Add a subscription</Label>
            <Input
              className="font-mono"
              value={url}
              placeholder="https://…"
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") add();
              }}
            />
          </div>
          <Button variant="outline" onClick={add} disabled={!url.trim()}>
            <Plus />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  function add() {
    const trimmed = url.trim();
    if (!trimmed) return;
    onChange([...sources, { name: labelFor(trimmed, sources.length), url: trimmed, enabled: true }]);
    setUrl("");
  }
}

function Nodes({
  nodes,
  running,
  selected,
  busy,
  onRefresh,
  onTest,
  onSelect,
}: {
  nodes: ChainNode[];
  running: boolean;
  selected: string | null;
  busy: string | null;
  onRefresh: () => void;
  onTest: (node: ChainNode) => void;
  onSelect: (node: ChainNode) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 pb-1 space-y-0">
        <div>
          <CardTitle className="text-[15px]">Nodes</CardTitle>
          <CardDescription>
            Every measurement here travels the tunnel, so a figure means the node works from behind
            it — and a failure means it does not.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={onRefresh}>
          <RefreshCw />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="pt-2">
        {!running ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            Connect with the chain switched on to load nodes.
          </p>
        ) : !nodes.length ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            No nodes yet. Check that a subscription is enabled.
          </p>
        ) : (
          <div className="flex flex-col">
            {nodes.map((node) => {
              const active = node.name === selected;
              return (
                <div
                  key={`${node.source}/${node.name}`}
                  className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
                >
                  <span
                    className={[
                      "grid size-7 shrink-0 place-items-center rounded-md",
                      active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    <Link2 className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{node.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {node.kind} · {node.source}
                    </div>
                  </div>
                  <span
                    className={[
                      "tabular w-[68px] shrink-0 text-right font-mono text-[12.5px]",
                      node.delay == null ? "text-muted-foreground" : "text-primary",
                    ].join(" ")}
                  >
                    {node.delay == null ? "—" : `${node.delay} ms`}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    disabled={busy === node.name}
                    onClick={() => onTest(node)}
                  >
                    Test
                  </Button>
                  <Button
                    variant={active ? "secondary" : "outline"}
                    size="sm"
                    className="w-[86px] shrink-0"
                    disabled={busy === node.name}
                    onClick={() => onSelect(node)}
                  >
                    {active ? "In use" : <><Zap />Use</>}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A subscription link is a credential, and this screen gets shown in support
 * threads and screenshots. Enough of it stays visible to tell two apart.
 */
export function redact(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/…`;
  } catch {
    return "…";
  }
}

function labelFor(url: string, index: number): string {
  try {
    return new URL(url).hostname;
  } catch {
    return `Subscription ${index + 1}`;
  }
}
