import { create } from "zustand";
import type { AlertType, AlertView, OblastAlertState } from "@/lib/types";

type Key = string;

function keyOf(uid: number, type: AlertType): Key {
  return `${uid}:${type}`;
}

interface AlertsState {
  connected: boolean;
  alerts: Map<Key, AlertView>;
  setConnected: (v: boolean) => void;
  setSnapshot: (alerts: AlertView[]) => void;
  upsert: (a: AlertView) => void;
  remove: (uid: number, type: AlertType) => void;
}

export const useAlertsStore = create<AlertsState>((set) => ({
  connected: false,
  alerts: new Map(),
  setConnected: (v) => set({ connected: v }),
  setSnapshot: (alerts) =>
    set({
      alerts: new Map(alerts.map((a) => [keyOf(a.location_uid, a.alert_type), a])),
    }),
  upsert: (a) =>
    set((s) => {
      const next = new Map(s.alerts);
      next.set(keyOf(a.location_uid, a.alert_type), a);
      return { alerts: next };
    }),
  remove: (uid, type) =>
    set((s) => {
      const next = new Map(s.alerts);
      next.delete(keyOf(uid, type));
      return { alerts: next };
    }),
}));

export function selectActiveTitles(state: AlertsState): Set<string> {
  // Always match by the parent oblast title — sub-oblast alerts (raion /
  // hromada / city) need to light up their containing oblast on the map.
  const set = new Set<string>();
  for (const a of state.alerts.values()) set.add(a.location_oblast || a.location_title);
  return set;
}

// Severity ladder — higher index wins when an oblast has multiple alerts.
const SEVERITY: Record<OblastAlertState, number> = {
  safe: 0,
  air_raid: 1,
  air_raid_drone: 2,
  artillery_shelling: 3,
  urban_fights: 4,
};

const DRONE_NOTES_RE = /бпла|дрон|шахед|shahed/i;

function classify(a: AlertView): OblastAlertState {
  switch (a.alert_type) {
    case "urban_fights":
      return "urban_fights";
    case "artillery_shelling":
      return "artillery_shelling";
    case "air_raid":
      return a.notes && DRONE_NOTES_RE.test(a.notes) ? "air_raid_drone" : "air_raid";
    default:
      return "air_raid";
  }
}

/** Map of oblast title → worst-case alert state currently in effect. */
export function selectOblastStateMap(state: AlertsState): Map<string, OblastAlertState> {
  const out = new Map<string, OblastAlertState>();
  for (const a of state.alerts.values()) {
    const title = a.location_oblast || a.location_title;
    const next = classify(a);
    const prev = out.get(title);
    if (!prev || SEVERITY[next] > SEVERITY[prev]) out.set(title, next);
  }
  return out;
}

export function selectAlertsList(state: AlertsState): AlertView[] {
  return Array.from(state.alerts.values()).sort(
    (a, b) => +new Date(b.started_at) - +new Date(a.started_at),
  );
}
