"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Period } from "@/lib/api";

function bucketLabel(min: number, max: number | null): string {
  if (max === null) return `${min}+ хв`;
  return `${min}–${max} хв`;
}

export function DurationHistogram({ period }: { period: Period }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats", "duration-histogram", period],
    queryFn: () => api.statsDurationHistogram(period),
    staleTime: 60_000,
  });

  if (isLoading)
    return <div className="text-sm text-fg-subtle">Завантаження…</div>;
  if (isError)
    return <div className="text-sm text-alert">Помилка завантаження</div>;

  const buckets = (data?.buckets ?? []).map((b) => ({
    label: bucketLabel(b.range_min, b.range_max),
    count: b.count,
  }));
  if ((data?.total ?? 0) === 0)
    return (
      <div className="flex h-56 items-center justify-center text-sm text-fg-subtle">
        Поки немає даних
      </div>
    );

  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-fg-muted tabular-nums">
        <span>Всього: {data!.total}</span>
        <span>Медіана: {data!.median_minutes?.toFixed(0) ?? "—"} хв</span>
        <span>p95: {data!.p95_minutes?.toFixed(0) ?? "—"} хв</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262931" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 10 }} axisLine={{ stroke: "#262931" }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={{ stroke: "#262931" }} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#16191f", border: "1px solid #262931", borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: "#a1a1aa" }}
              itemStyle={{ color: "#e5e7eb" }}
              formatter={(v: number) => [v, "Тривог"]}
            />
            <Bar dataKey="count" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
