"use client";

import { cn } from "@/lib/cn";

/**
 * The full-width on/off control repeated across the Stats panel
 * (siren, shelters, political basemap, push, heatmap). One shell, one set of
 * states, a per-feature semantic accent.
 *
 * Accent classes are spelled out statically (never interpolated) so Tailwind's
 * JIT keeps them in the build.
 */
export type ToggleAccent = "warn" | "safe" | "accent" | "alert";

const ACTIVE: Record<ToggleAccent, string> = {
  warn: "border-warn/45 bg-warn/10 text-warn",
  safe: "border-safe/45 bg-safe/10 text-safe",
  accent: "border-accent/45 bg-accent/10 text-accent",
  alert: "border-alert/45 bg-alert/10 text-alert",
};

const CHIP_ACTIVE: Record<ToggleAccent, string> = {
  warn: "bg-warn/15 text-warn",
  safe: "bg-safe/15 text-safe",
  accent: "bg-accent/15 text-accent",
  alert: "bg-alert/15 text-alert",
};

export function ToggleRow({
  icon,
  label,
  active,
  onClick,
  accent = "accent",
  disabled = false,
  title,
  onText = "увімк.",
  offText = "вимк.",
  busy = false,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  active: boolean;
  onClick: () => void;
  accent?: ToggleAccent;
  disabled?: boolean;
  title?: string;
  onText?: string;
  offText?: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      aria-busy={busy}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors duration-150",
        active
          ? ACTIVE[accent]
          : "border-border bg-surface-2/40 text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg",
        disabled &&
          "cursor-not-allowed opacity-45 hover:border-border hover:bg-surface-2/40 hover:text-fg-muted",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider tabular-nums transition-colors",
          active ? CHIP_ACTIVE[accent] : "bg-surface-3 text-fg-faint",
        )}
      >
        {busy ? "…" : active ? onText : offText}
      </span>
    </button>
  );
}
