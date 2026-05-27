import { create } from "zustand";
import type { AlertType, AlertView } from "@/lib/types";

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
  const set = new Set<string>();
  for (const a of state.alerts.values()) set.add(a.location_title);
  return set;
}

export function selectAlertsList(state: AlertsState): AlertView[] {
  return Array.from(state.alerts.values()).sort(
    (a, b) => +new Date(b.started_at) - +new Date(a.started_at),
  );
}
