"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Full-width navigation row (timelapse, about, support…). Same visual rhythm as
 * ToggleRow but for links: leading icon + label, trailing hint. Renders a Next
 * <Link> for internal hrefs and a plain <a> for external ones.
 */
export function NavRow({
  href,
  icon,
  label,
  hint,
  external = false,
  emphasis = false,
  title,
}: {
  href: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  hint?: string;
  external?: boolean;
  /** Warm "support the project" treatment. */
  emphasis?: boolean;
  title?: string;
}) {
  const className = cn(
    "group flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors duration-150",
    emphasis
      ? "border-alert/35 bg-alert/[0.06] text-alert/90 hover:border-alert/70 hover:bg-alert/10"
      : "border-border bg-surface-2/40 text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg",
  );

  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {hint && (
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-fg-faint transition-colors group-hover:text-fg-subtle">
          {hint}
        </span>
      )}
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} title={title}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={className} title={title}>
      {inner}
    </Link>
  );
}
