"use client";

import { Plane } from "lucide-react";
import { useAviation, type AviationEvent } from "@/hooks/useAviation";

const STATUS_LABEL_UK: Record<string, string> = {
  in_air: "у повітрі",
  takeoff: "зліт",
  landing: "посадка",
};

const CRAFT_RISK_UK: Record<string, string> = {
  mig31k: "ризик пусків «Кинджалів» (~30-90 хв)",
  tu95: "ризик пусків Х-101 (~2-6 год)",
  tu160: "ризик пусків Х-101 (~2-6 год)",
  tu22m3: "ризик пусків Х-22/Х-32 (~1-4 год)",
};

function minutesUntil(iso: string): number {
  return Math.max(0, Math.floor((+new Date(iso) - Date.now()) / 60_000));
}

function Item({ ev }: { ev: AviationEvent }) {
  const mLeft = minutesUntil(ev.expires_at);
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[12px]">
      <Plane size={14} className="shrink-0 text-amber-300" />
      <div className="min-w-0">
        <span className="font-semibold text-amber-100">{ev.craft_label}</span>
        <span className="text-amber-200/80"> · {STATUS_LABEL_UK[ev.status] ?? ev.status}</span>
        <span className="ml-1 text-amber-200/60">— {CRAFT_RISK_UK[ev.craft] ?? ""}</span>
        <span className="ml-1 text-amber-300/70">· ~{mLeft} хв</span>
      </div>
    </div>
  );
}

export function AviationBanner() {
  const { data } = useAviation();
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[calc(var(--safe-top)+0.75rem)] z-30 flex w-[min(720px,calc(100vw-7rem))] -translate-x-1/2 flex-col gap-1.5"
      aria-live="polite"
    >
      {items.map((ev) => (
        <div key={ev.id} className="pointer-events-auto">
          <Item ev={ev} />
        </div>
      ))}
    </div>
  );
}
