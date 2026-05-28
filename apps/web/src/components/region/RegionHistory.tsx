"use client";

import { useState } from "react";
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
import type { Period } from "@/lib/api";
import { formatDuration } from "@/lib/format";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Доба" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
];

interface Bucket {
  date: string;
  label: string;
  count: number;
  durationMin: number;
}

function bucketByDay(items: { started_at: string; duration_seconds: number }[], period: Period): Bucket[] {
  const days = period === "day" ? 1 : period === "week" ? 7 : 30;
  const now = new Date();
  const buckets = new Map<string, Bucket>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      label: key.slice(5).replace("-", "."),
      count: 0,
      durationMin: 0,
    });
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

export function RegionHistory({
  regionUid,
  regionTitle,
  oblastFullName,
}: {
  regionUid: number;
  regionTitle: string;
  oblastFullName: string;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const { data, isLoading, isError } = useHistoryByOblast(oblastFullName, period);

  const buckets = data ? bucketByDay(data.items, period) : [];
  const total = data?.items.length ?? 0;
  const totalMin = buckets.reduce((acc, b) => acc + b.durationMin, 0);

  return (
    <section className="rounded-md border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-100">
          Історія тривог · {regionTitle}
        </h2>
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={
                "rounded px-2.5 py-1 text-xs " +
                (period === p.value
                  ? "bg-zinc-100 text-zinc-900"
                  : "border border-border text-zinc-300 hover:border-zinc-600")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex gap-4 text-xs text-zinc-400 tabular-nums">
        <span>Тривог: {total}</span>
        <span>Час: {formatDuration(totalMin * 60_000)}</span>
      </div>

      {isLoading && (
        <div className="text-sm text-zinc-500">Завантаження…</div>
      )}
      {isError && (
        <div className="text-sm text-rose-400">Помилка завантаження</div>
      )}
      {!isLoading && !isError && (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#0a0a0b", border: "1px solid #27272a", borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: "#9ca3af" }}
                itemStyle={{ color: "#e5e7eb" }}
                formatter={(v: number) => [v, "Тривог"]}
              />
              <Bar dataKey="count" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
