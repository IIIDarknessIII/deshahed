import { create } from "zustand";
import type { DroneTrack } from "@/lib/types";

interface TracksState {
  connected: boolean;
  tracks: Map<string, DroneTrack>;
  setConnected: (v: boolean) => void;
  setSnapshot: (tracks: DroneTrack[]) => void;
  upsert: (track: DroneTrack) => void;
}

export const useTracksStore = create<TracksState>((set) => ({
  connected: false,
  tracks: new Map(),
  setConnected: (v) => set({ connected: v }),
  setSnapshot: (tracks) =>
    set({ tracks: new Map(tracks.map((t) => [t.id, t])) }),
  upsert: (t) =>
    set((s) => {
      // Drop tracks that flipped is_active=false.
      const next = new Map(s.tracks);
      if (!t.is_active) {
        next.delete(t.id);
      } else {
        next.set(t.id, t);
      }
      return { tracks: next };
    }),
}));
