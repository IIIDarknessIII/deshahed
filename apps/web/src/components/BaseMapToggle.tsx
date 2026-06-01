"use client";

import { Globe } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";

export function BaseMapToggle() {
  const on = useUiStore((s) => s.baseMap === "political");
  const toggle = useUiStore((s) => s.toggleBaseMap);
  return (
    <button
      type="button"
      onClick={toggle}
      className={
        "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition " +
        (on
          ? "border-sky-500/60 bg-sky-500/10 text-sky-300"
          : "border-border text-zinc-300 hover:border-zinc-600")
      }
      aria-pressed={on}
      title="Політична карта (кордони, міста, дороги) під шаром тривог"
    >
      <span className="flex items-center gap-2">
        <Globe size={14} />
        Політична карта
      </span>
      <span className="text-[10px] uppercase tracking-wide">
        {on ? "увімк." : "вимк."}
      </span>
    </button>
  );
}
