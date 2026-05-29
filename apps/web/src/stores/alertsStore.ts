import { create } from "zustand";
import type {
  AlertType,
  AlertView,
  OblastAggregate,
  OblastAlertState,
  OblastSubAlert,
} from "@/lib/types";

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
  artillery_shelling: 2,
  urban_fights: 3,
};

function classify(a: AlertView): OblastAlertState {
  switch (a.alert_type) {
    case "urban_fights":
      return "urban_fights";
    case "artillery_shelling":
      return "artillery_shelling";
    case "air_raid":
      return "air_raid";
    default:
      return "air_raid";
  }
}

/** Per-oblast aggregate that splits oblast-level vs sub-region alerts.
 *
 *  Choropleth paints `state` ONLY from oblast-level alerts. Sub-region
 *  alerts still appear in the hover popup's `sub` list — they just don't
 *  recolour the whole region (one hromada urban_fights ≠ whole oblast on
 *  fire).
 */
export function selectOblastAggregate(state: AlertsState): Map<string, OblastAggregate> {
  const out = new Map<string, OblastAggregate>();
  for (const a of state.alerts.values()) {
    const title = a.location_oblast || a.location_title;
    const isOblast = a.location_type === "oblast" || a.location_type === "autonomous_republic";
    const cls = classify(a);
    let agg = out.get(title);
    if (!agg) {
      agg = { state: "safe", oblast_level: false, sub: [] };
      out.set(title, agg);
    }
    if (isOblast) {
      if (!agg.oblast_level || SEVERITY[cls] > SEVERITY[agg.state]) {
        agg.state = cls;
        agg.oblast_level = true;
      }
    } else {
      const sub: OblastSubAlert = {
        title: a.location_title,
        state: cls,
        alert_type: a.alert_type,
        location_type: a.location_type,
        started_at: a.started_at,
      };
      agg.sub.push(sub);
    }
  }
  return out;
}

export function selectAlertsList(state: AlertsState): AlertView[] {
  return Array.from(state.alerts.values()).sort(
    (a, b) => +new Date(b.started_at) - +new Date(a.started_at),
  );
}
