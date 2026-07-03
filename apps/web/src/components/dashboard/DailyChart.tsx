"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Period } from "@/lib/api";

export function DailyChart({ period }: { period: Period }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats", "daily", period],
    queryFn: () => api.statsDaily(period),
    staleTime: 60_000,
  });

  if (isLoading)
    return <div className="text-sm text-fg-subtle">Завантаження…</div>;
  if (isError)
    return <div className="text-sm text-alert">Помилка завантаження</div>;

  const items = (data?.items ?? []).map((d) => ({
    label: d.date.slice(5),
    count: d.count,
    durationMin: d.duration_minutes,
  }));

  if (items.length === 0)
    return (
      <div className="flex h-64 items-center justify-center text-sm text-fg-subtle">
        Поки немає даних
      </div>
    );

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262931" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={{ stroke: "#262931" }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={{ stroke: "#262931" }} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "#16191f", border: "1px solid #262931", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "#a1a1aa" }}
            itemStyle={{ color: "#e5e7eb" }}
            formatter={(v: number, name) =>
              name === "count" ? [v, "Тривог"] : [`${v} хв`, "Час"]
            }
          />
          <Bar dataKey="count" fill="#ef4444" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
