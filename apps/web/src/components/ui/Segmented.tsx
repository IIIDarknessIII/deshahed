"use client";

import { cn } from "@/lib/cn";

/**
 * Compact segmented control — a row of mutually-exclusive options sharing one
 * track (used for the heatmap period picker; reusable anywhere a small enum is
 * chosen). The selected segment lifts onto a raised surface.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex gap-1 rounded-lg border border-border bg-surface p-1"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150",
              selected
                ? "bg-surface-3 text-fg shadow-card"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
