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
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { IconButton } from "@/components/ui/IconButton";

// Chart colours mirror the design tokens (recharts needs literal values).
const CHART = {
  grid: "#262931",
  axis: "#a1a1aa",
  tooltipBg: "#16191f",
  tooltipLabel: "#a1a1aa",
  tooltipItem: "#f4f4f5",
  bar: "#ef4444",
} as const;

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
    <Modal onClose={() => selectLocation(null)} size="lg" contentClassName="md:max-h-none">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div>
          <div className="text-base font-semibold tracking-tight text-fg">{title}</div>
          <div className="text-xs text-fg-subtle">Історія тривог</div>
        </div>
        <IconButton label="Закрити" onClick={() => selectLocation(null)} className="-mr-1">
          <X size={20} />
        </IconButton>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-2.5">
        <div className="w-52">
          <Segmented options={PERIODS} value={period} onChange={setPeriod} ariaLabel="Період історії" />
        </div>
        <div className="ml-auto flex gap-4 font-mono text-xs tabular-nums text-fg-muted">
          <span>Тривог: <span className="text-fg">{totalItems}</span></span>
          <span>Час: <span className="text-fg">{formatDuration(totalDurationMin * 60_000)}</span></span>
        </div>
      </div>

      <div className="h-64 shrink-0 px-3 py-3 pb-[max(0.75rem,var(--safe-bottom))]">
        {isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
            Завантаження…
          </div>
        )}
        {isError && (
          <div className="flex h-full items-center justify-center text-sm text-alert">
            Помилка завантаження
          </div>
        )}
        {!isLoading && !isError && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={{ stroke: CHART.grid }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={{ stroke: CHART.grid }} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.grid}`, borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: CHART.tooltipLabel }}
                itemStyle={{ color: CHART.tooltipItem }}
                formatter={(v: number, name) => (name === "durationMin" ? [`${v} хв`, "Час"] : [v, "Тривог"])}
              />
              <Bar dataKey="count" fill={CHART.bar} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Modal>
  );
}
