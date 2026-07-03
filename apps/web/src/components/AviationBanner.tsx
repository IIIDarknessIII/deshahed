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

// More urgent statuses sort first and win when collapsing a craft group.
const STATUS_RANK: Record<string, number> = { takeoff: 0, in_air: 1, landing: 2 };

interface CraftGroup {
  craft: string;
  craft_label: string;
  status: string;
  count: number;
  maxMinutes: number;
}

// Multiple channels report the same aircraft, so collapse events by craft type
// to keep the banner compact instead of one row per (duplicated) report.
function groupByCraft(items: AviationEvent[]): CraftGroup[] {
  const byCraft = new Map<string, CraftGroup>();
  for (const ev of items) {
    const g = byCraft.get(ev.craft);
    const mLeft = minutesUntil(ev.expires_at);
    if (!g) {
      byCraft.set(ev.craft, {
        craft: ev.craft,
        craft_label: ev.craft_label,
        status: ev.status,
        count: 1,
        maxMinutes: mLeft,
      });
      continue;
    }
    g.count += 1;
    g.maxMinutes = Math.max(g.maxMinutes, mLeft);
    if ((STATUS_RANK[ev.status] ?? 9) < (STATUS_RANK[g.status] ?? 9)) g.status = ev.status;
  }
  return [...byCraft.values()].sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || b.count - a.count,
  );
}

function Item({ g }: { g: CraftGroup }) {
  const risk = CRAFT_RISK_UK[g.craft] ?? "";
  return (
    <div className="flex animate-fade-in items-center gap-2.5 rounded-lg border border-warn/35 bg-surface/85 px-3 py-2 shadow-float backdrop-blur-md">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warn/15 text-warn">
        <Plane size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] leading-tight">
          <span className="font-semibold text-fg">{g.craft_label}</span>
          {g.count > 1 && (
            <span className="font-mono text-xs text-warn/80">×{g.count}</span>
          )}
          <span className="text-fg-faint">·</span>
          <span className="text-warn">{STATUS_LABEL_UK[g.status] ?? g.status}</span>
        </div>
        {risk && <div className="truncate text-[11px] text-fg-subtle">{risk}</div>}
      </div>
      <span className="shrink-0 rounded-md bg-warn/12 px-2 py-1 font-mono text-[11px] tabular-nums text-warn">
        ~{g.maxMinutes} хв
      </span>
    </div>
  );
}

export function AviationBanner() {
  const { data } = useAviation();
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const groups = groupByCraft(items);

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[calc(var(--safe-top)+0.75rem)] z-30 flex w-[min(720px,calc(100vw-7rem))] -translate-x-1/2 flex-col gap-1.5"
      aria-live="polite"
    >
      {groups.map((g) => (
        <div key={g.craft} className="pointer-events-auto">
          <Item g={g} />
        </div>
      ))}
    </div>
  );
}
