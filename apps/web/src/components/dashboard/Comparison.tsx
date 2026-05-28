"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";

function DeltaPill({ pct }: { pct: number | null }) {
  if (pct === null)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
        <Minus size={12} /> —
      </span>
    );
  const sign = pct >= 0;
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-xs tabular-nums " +
        (sign ? "text-rose-400" : "text-emerald-400")
      }
    >
      {sign ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {sign ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  );
}

function Card({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-bg/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{value}</div>
      <div className="mt-1">{sub}</div>
    </div>
  );
}

export function Comparison() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats", "comparison"],
    queryFn: () => api.statsComparison(),
    staleTime: 60_000,
  });

  if (isLoading)
    return <div className="text-sm text-zinc-500">Завантаження…</div>;
  if (isError)
    return <div className="text-sm text-rose-400">Помилка завантаження</div>;

  const c = data!;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card
        title="Тривог сьогодні"
        value={String(c.today.total_alerts)}
        sub={
          <span className="text-xs text-zinc-400">
            вчора: {c.yesterday.total_alerts}{" "}
            <DeltaPill pct={c.alerts_delta_pct} />
          </span>
        }
      />
      <Card
        title="Час сьогодні"
        value={formatDuration(c.today.total_duration_minutes * 60_000)}
        sub={
          <span className="text-xs text-zinc-400">
            вчора: {formatDuration(c.yesterday.total_duration_minutes * 60_000)}{" "}
            <DeltaPill pct={c.duration_delta_pct} />
          </span>
        }
      />
    </div>
  );
}
