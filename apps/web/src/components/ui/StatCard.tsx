"use client";

import { cn } from "@/lib/cn";

/**
 * Raised metric tile — the number is the hero (monospace, tabular). Optional
 * leading icon and a semantic accent for the value.
 */
export function StatCard({
  label,
  value,
  icon,
  accent = "fg",
  className,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: "fg" | "alert" | "warn" | "safe" | "accent";
  className?: string;
}) {
  const valueColor: Record<string, string> = {
    fg: "text-fg",
    alert: "text-alert",
    warn: "text-warn",
    safe: "text-safe",
    accent: "text-accent",
  };
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface-2/60 px-3 py-2.5 shadow-card",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        {icon && <span className="shrink-0 text-fg-faint">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-1 font-mono text-xl font-semibold tabular-nums", valueColor[accent])}>
        {value}
      </div>
    </div>
  );
}
