import { create } from "zustand";
import type {
  AlertType,
  AlertView,
  OblastAggregate,
  OblastAlertState,
  OblastSubAlert,
} from "@/lib/types";
import { subKey } from "@/lib/subregions";

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

// Which states are area-wide enough that a sub-region alert should still
// paint the whole oblast. air_raid and artillery_shelling cover broad
// territory (sirens / counter-battery zones); urban_fights is by definition
// confined to a single hromada, so a sub-region urban_fights stays out of
// the choropleth and is shown only in the popup.
const ESCALATES_FROM_SUB: ReadonlySet<OblastAlertState> = new Set([
  "air_raid",
  "artillery_shelling",
]);

/** Per-oblast aggregate that combines oblast-level + escalated sub alerts.
 *
 *  Choropleth paints `state`:
 *    - max-severity over (oblast-level alerts ∪ sub-region alerts whose
 *      type is in ESCALATES_FROM_SUB).
 *    - "safe" when neither contributes.
 *
 *  The hover popup still gets the full `sub` list — including urban_fights
 *  in tiny hromadas that are intentionally excluded from the choropleth.
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

    const paintsChoropleth = isOblast || ESCALATES_FROM_SUB.has(cls);
    if (paintsChoropleth && SEVERITY[cls] > SEVERITY[agg.state]) {
      agg.state = cls;
    }
    if (isOblast) agg.oblast_level = true;

    if (!isOblast) {
      agg.sub.push({
        title: a.location_title,
        state: cls,
        alert_type: a.alert_type,
        location_type: a.location_type,
        started_at: a.started_at,
      });
    }
  }
  return out;
}

export interface SubRegionState {
  state: OblastAlertState;
  started_at: string;
  title: string;
}

/**
 * Per-sub-region state keyed by the normalized match key (see lib/subregions).
 * Drives the raion/hromada choropleth directly: unlike the oblast roll-up, a
 * sub-region paints with its *own* alert (including urban_fights, which is
 * confined to a single hromada and so belongs exactly here).
 */
export function selectSubRegionStates(state: AlertsState): Map<string, SubRegionState> {
  const out = new Map<string, SubRegionState>();
  for (const a of state.alerts.values()) {
    if (a.location_type !== "raion" && a.location_type !== "hromada") continue;
    const key = subKey(a.location_title);
    const cls = classify(a);
    const prev = out.get(key);
    if (!prev || SEVERITY[cls] > SEVERITY[prev.state]) {
      out.set(key, { state: cls, started_at: a.started_at, title: a.location_title });
    }
  }
  return out;
}

export function selectAlertsList(state: AlertsState): AlertView[] {
  return Array.from(state.alerts.values()).sort(
    (a, b) => +new Date(b.started_at) - +new Date(a.started_at),
  );
}
