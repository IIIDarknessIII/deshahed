import { create } from "zustand";

export type MobileSheet = "alerts" | "stats" | null;
export type HeatmapPeriod = "day" | "week" | "month";
// Base map style. "default" = the dark threat-overlay canvas (no basemap),
// "political" = a real political basemap (borders, cities) under the overlays.
export type BaseMap = "default" | "political";

interface UiState {
  selectedLocationUid: number | null;
  selectedDroneId: number | null;
  mobileSheet: MobileSheet;
  heatmapOn: boolean;
  heatmapPeriod: HeatmapPeriod;
  sheltersOn: boolean;
  baseMap: BaseMap;
  selectLocation: (uid: number | null) => void;
  selectDrone: (id: number | null) => void;
  setMobileSheet: (s: MobileSheet) => void;
  toggleMobileSheet: (s: Exclude<MobileSheet, null>) => void;
  setHeatmapOn: (v: boolean) => void;
  setHeatmapPeriod: (p: HeatmapPeriod) => void;
  setSheltersOn: (v: boolean) => void;
  setBaseMap: (m: BaseMap) => void;
  toggleBaseMap: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedLocationUid: null,
  selectedDroneId: null,
  mobileSheet: null,
  heatmapOn: false,
  heatmapPeriod: "week",
  sheltersOn: false,
  baseMap: "default",
  selectLocation: (uid) => set({ selectedLocationUid: uid }),
  selectDrone: (id) => set({ selectedDroneId: id }),
  setMobileSheet: (s) => set({ mobileSheet: s }),
  toggleMobileSheet: (s) =>
    set((state) => ({ mobileSheet: state.mobileSheet === s ? null : s })),
  setHeatmapOn: (v) => set({ heatmapOn: v }),
  setHeatmapPeriod: (p) => set({ heatmapPeriod: p }),
  setSheltersOn: (v) => set({ sheltersOn: v }),
  setBaseMap: (m) => set({ baseMap: m }),
  toggleBaseMap: () =>
    set((state) => ({ baseMap: state.baseMap === "political" ? "default" : "political" })),
}));
