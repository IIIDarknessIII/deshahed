"use client";

import { cn } from "@/lib/cn";

/**
 * A status dot with an optional expanding "sonar" ring for live/active states
 * (connection indicator, active air-raid marker). The ring is a sibling that
 * animates scale+fade; both honour prefers-reduced-motion via globals.css.
 */
export function LiveDot({
  color = "alert",
  pulsing = true,
  size = 8,
  className,
}: {
  color?: "alert" | "warn" | "safe" | "accent" | "muted";
  pulsing?: boolean;
  size?: number;
  className?: string;
}) {
  const dot: Record<string, string> = {
    alert: "bg-alert",
    warn: "bg-warn",
    safe: "bg-safe",
    accent: "bg-accent",
    muted: "bg-fg-faint",
  };
  const ring: Record<string, string> = {
    alert: "bg-alert/60",
    warn: "bg-warn/60",
    safe: "bg-safe/60",
    accent: "bg-accent/60",
    muted: "bg-fg-faint/60",
  };

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {pulsing && (
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-pulse-ring motion-reduce:hidden",
            ring[color],
          )}
        />
      )}
      <span className={cn("relative inline-block h-full w-full rounded-full", dot[color])} />
    </span>
  );
}
