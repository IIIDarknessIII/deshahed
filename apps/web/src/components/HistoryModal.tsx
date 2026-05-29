"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useHistoryByOblast } from "@/hooks/useHistory";
import { useUiStore } from "@/stores/uiStore";
import { TITLE_BY_UID } from "@/lib/locations";
import { type HistoryItem, type Period } from "@/lib/api";
import { formatDuration } from "@/lib/format";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Доба" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
];

interface DayBucket {
  date: string;
  label: string;
  count: number;
  durationMin: number;
}

function bucketByDay(items: HistoryItem[], period: Period): DayBucket[] {
  const days = period === "day" ? 1 : period === "week" ? 7 : 30;
  const now = new Date();
  const buckets = new Map<string, DayBucket>();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = key.slice(5).replace("-", ".");
    buckets.set(key, { date: key, label, count: 0, durationMin: 0 });
  }

  for (const it of items) {
    const key = it.started_at.slice(0, 10);
    const b = buckets.get(key);
    if (b) {
      b.count += 1;
      b.durationMin += Math.round(it.duration_seconds / 60);
    }
  }

  return Array.from(buckets.values());
}

export function HistoryModal() {
  const selectedUid = useUiStore((s) => s.selectedLocationUid);
  const selectLocation = useUiStore((s) => s.selectLocation);
  const [period, setPeriod] = useState<Period>("week");

  // The Map click handler hands us alerts.in.ua's synthetic oblast UID from
  // lib/locations, but alert_events.location_uid in our DB carries the
  // sub-region UID alerts.in.ua actually fires at. Match by the canonical
  // oblast TITLE string instead — same approach the choropleth uses.
  const oblast = selectedUid !== null ? TITLE_BY_UID[selectedUid] ?? null : null;
  const { data, isLoading, isError } = useHistoryByOblast(oblast, period);

  const buckets = useMemo(
    () => (data ? bucketByDay(data.items, period) : []),
    [data, period],
  );

  if (selectedUid === null) return null;

  const title = oblast ?? `UID ${selectedUid}`;
  const totalItems = data?.items.length ?? 0;
  const totalDurationMin = buckets.reduce((acc, b) => acc + b.durationMin, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => selectLocation(null)}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-base font-semibold text-zinc-100">{title}</div>
            <div className="text-xs text-zinc-500">Історія тривог</div>
          </div>
          <button
            type="button"
            onClick={() => selectLocation(null)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Закрити"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={
                "rounded px-3 py-1 text-xs " +
                (period === p.value
                  ? "bg-zinc-100 text-zinc-900"
                  : "border border-border text-zinc-300 hover:border-zinc-600")
              }
            >
              {p.label}
            </button>
          ))}
          <div className="ml-auto flex gap-4 text-xs text-zinc-400 tabular-nums">
            <span>Тривог: {totalItems}</span>
            <span>Час: {formatDuration(totalDurationMin * 60_000)}</span>
          </div>
        </div>

        <div className="h-64 px-3 py-3">
          {isLoading && (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Завантаження…
            </div>
          )}
          {isError && (
            <div className="flex h-full items-center justify-center text-sm text-rose-400">
              Помилка завантаження
            </div>
          )}
          {!isLoading && !isError && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0a0a0b", border: "1px solid #27272a", borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: "#9ca3af" }}
                  itemStyle={{ color: "#e5e7eb" }}
                  formatter={(v: number, name) => (name === "durationMin" ? [`${v} хв`, "Час"] : [v, "Тривог"])}
                />
                <Bar dataKey="count" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
