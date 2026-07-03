"use client";

import { useShallow } from "zustand/react/shallow";
import { useAlertsSocket } from "@/lib/ws";
import { useAlertsStore, selectSubRegionStates } from "@/stores/alertsStore";
import { formatDuration } from "@/lib/format";
import type { OblastAlertState } from "@/lib/types";

const META: Record<Exclude<OblastAlertState, "safe">, { label: string; cls: string }> = {
  air_raid: { label: "Повітряна тривога", cls: "border-alert/50 bg-alert/10 text-alert" },
  artillery_shelling: {
    label: "Загроза артобстрілу",
    cls: "border-artillery/50 bg-artillery/10 text-artillery",
  },
  urban_fights: {
    label: "Загроза вуличних боїв",
    cls: "border-street/50 bg-street/10 text-street",
  },
};

export interface InitialStatus {
  state: Exclude<OblastAlertState, "safe"> | "safe";
  since: string | null;
}

/**
 * Live alert status for one sub-region. Renders the server-provided `initial`
 * status first (so the real state is in the SSR HTML for crawlers), then the
 * WebSocket takes over for realtime updates once connected.
 */
export function SubRegionStatus({ mkey, initial }: { mkey: string; initial?: InitialStatus }) {
  const connected = useAlertsStore((s) => s.connected);
  useAlertsSocket();
  const live = useAlertsStore(
    useShallow((s) => selectSubRegionStates(s).get(mkey) ?? null),
  );
  // Before the socket connects, trust the SSR value; after, the store wins.
  const sr =
    live ??
    (!connected && initial && initial.state !== "safe"
      ? { state: initial.state, started_at: initial.since ?? new Date().toISOString() }
      : null);

  if (!sr) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-safe/50 bg-safe/10 px-4 py-3 text-sm text-safe">
        <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-safe" />
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
      <span className="shrink-0 font-mono tabular-nums opacity-80">{since}</span>
    </div>
  );
}
