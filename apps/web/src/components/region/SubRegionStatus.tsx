"use client";

import { useShallow } from "zustand/react/shallow";
import { useAlertsSocket } from "@/lib/ws";
import { useAlertsStore, selectSubRegionStates } from "@/stores/alertsStore";
import { formatDuration } from "@/lib/format";
import type { OblastAlertState } from "@/lib/types";

const META: Record<Exclude<OblastAlertState, "safe">, { label: string; cls: string }> = {
  air_raid: { label: "Повітряна тривога", cls: "border-red-500/50 bg-red-500/10 text-red-300" },
  artillery_shelling: {
    label: "Загроза артобстрілу",
    cls: "border-orange-500/50 bg-orange-500/10 text-orange-300",
  },
  urban_fights: {
    label: "Загроза вуличних боїв",
    cls: "border-purple-500/50 bg-purple-500/10 text-purple-300",
  },
};

/**
 * Live alert status for one sub-region. Opens the same WebSocket the map uses
 * and reads the region's own state by its normalized match key.
 */
export function SubRegionStatus({ mkey }: { mkey: string }) {
  useAlertsSocket();
  const sr = useAlertsStore(
    useShallow((s) => selectSubRegionStates(s).get(mkey) ?? null),
  );

  if (!sr) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-600/50 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-300">
        <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
        Зараз тривоги немає
      </div>
    );
  }

  const meta = META[sr.state as Exclude<OblastAlertState, "safe">] ?? META.air_raid;
  const since = formatDuration(Date.now() - +new Date(sr.started_at));
  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${meta.cls}`}>
      <span className="flex items-center gap-2 font-medium">
        <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-current" />
        Зараз: {meta.label}
      </span>
      <span className="shrink-0 tabular-nums opacity-80">{since}</span>
    </div>
  );
}
