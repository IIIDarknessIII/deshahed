import { create } from "zustand";
import type { DroneEvent } from "@/lib/types";

interface DronesState {
  connected: boolean;
  drones: Map<number, DroneEvent>;
  setConnected: (v: boolean) => void;
  setSnapshot: (drones: DroneEvent[]) => void;
  upsert: (drone: DroneEvent) => void;
  evictExpired: () => void;
}

export const useDronesStore = create<DronesState>((set) => ({
  connected: false,
  drones: new Map(),
  setConnected: (v) => set({ connected: v }),
  setSnapshot: (drones) =>
    set({ drones: new Map(drones.map((d) => [d.id, d])) }),
  upsert: (d) =>
    set((s) => {
      const next = new Map(s.drones);
      next.set(d.id, d);
      return { drones: next };
    }),
  evictExpired: () =>
    set((s) => {
      const now = Date.now();
      const next = new Map<number, DroneEvent>();
      for (const [id, d] of s.drones) {
        if (+new Date(d.expires_at) > now) next.set(id, d);
      }
      if (next.size === s.drones.size) return s;
      return { drones: next };
    }),
}));

export function selectDronesList(state: DronesState): DroneEvent[] {
  return Array.from(state.drones.values()).sort(
    (a, b) => +new Date(b.detected_at) - +new Date(a.detected_at),
  );
}
