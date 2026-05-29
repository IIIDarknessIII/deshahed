"use client";

import { Home } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";

export function ShelterToggle() {
  const on = useUiStore((s) => s.sheltersOn);
  const set = useUiStore((s) => s.setSheltersOn);
  return (
    <button
      type="button"
      onClick={() => set(!on)}
      className={
        "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition " +
        (on
          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
          : "border-border text-zinc-300 hover:border-zinc-600")
      }
      aria-pressed={on}
      title="Показати найближчі укриття (OSM)"
    >
      <span className="flex items-center gap-2">
        <Home size={14} />
        Найближчі укриття
      </span>
      <span className="text-[10px] uppercase tracking-wide">
        {on ? "увімк." : "вимк."}
      </span>
    </button>
  );
}
