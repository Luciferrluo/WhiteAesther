import type { PropsWithChildren } from "react";
import { cn } from "../../lib/cn";

export function Badge({ children, tone = "neutral" }: PropsWithChildren<{ tone?: "neutral" | "current" | "roadmap" }>) {
  return <span className={cn("ui-badge", tone)}>{children}</span>;
}
