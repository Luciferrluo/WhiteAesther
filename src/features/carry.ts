import { Globe, Laptop, Layers, type LucideIcon } from "lucide-react";

/**
 * The one decision a normal user makes: how far the tunnel reaches.
 *
 * Named for what the person gets, not for the mechanism — "whole machine"
 * rather than "system proxy", because nobody opens this app wanting to
 * configure a proxy.
 */
export type CarryMode = "app" | "system" | "tun";

export interface CarryOption {
  id: CarryMode;
  title: string;
  detail: string;
  icon: LucideIcon;
  /** Set while the engine work behind full-tunnel is outstanding. */
  disabled?: boolean;
  disabledReason?: string;
}

export const CARRY_OPTIONS: CarryOption[] = [
  {
    id: "app",
    title: "This app only",
    detail: "Local proxy on 127.0.0.1:1819",
    icon: Laptop,
  },
  {
    id: "system",
    title: "Whole machine",
    detail: "Sets your system proxy",
    icon: Globe,
  },
  {
    id: "tun",
    title: "Full tunnel",
    detail: "Every app, even ones that ignore proxies",
    icon: Layers,
    disabled: true,
    disabledReason: "Not in this build yet",
  },
];

export function carryFromProfile(systemProxy: boolean): CarryMode {
  return systemProxy ? "system" : "app";
}

export function describeCarry(mode: CarryMode, socksAddress: string): string {
  if (mode === "system") return "Your system proxy is set, and will be put back when you disconnect.";
  if (mode === "tun") return "Every app on this machine is going through the tunnel.";
  return `Point apps at ${socksAddress} to use it.`;
}
