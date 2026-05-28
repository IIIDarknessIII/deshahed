"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type Period } from "@/lib/api";
import { formatDuration } from "@/lib/format";

export function TopRegions({ period }: { period: Period }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats", "summary", "top10", period],
    queryFn: () => api.statsSummary(period),
    staleTime: 60_000,
  });

  if (isLoading)
    return <div className="text-sm text-zinc-500">Завантаження…</div>;
  if (isError)
    return <div className="text-sm text-rose-400">Помилка завантаження</div>;

  const top10 = (data?.by_oblast ?? []).slice(0, 10);
  if (top10.length === 0)
    return <div className="text-sm text-zinc-500">Поки немає даних</div>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
          <th className="py-1.5 pr-2 font-normal">#</th>
          <th className="py-1.5 pr-2 font-normal">Регіон</th>
          <th className="py-1.5 pr-2 text-right font-normal">Тривог</th>
          <th className="py-1.5 text-right font-normal">Час</th>
        </tr>
      </thead>
      <tbody>
        {top10.map((o, i) => (
          <tr key={o.location_uid} className="border-t border-border/60">
            <td className="py-1.5 pr-2 text-zinc-500 tabular-nums">{i + 1}</td>
            <td className="py-1.5 pr-2 truncate text-zinc-100">{o.location_title}</td>
            <td className="py-1.5 pr-2 text-right text-zinc-300 tabular-nums">{o.count}</td>
            <td className="py-1.5 text-right text-zinc-400 tabular-nums">
              {formatDuration(o.duration_minutes * 60_000)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
