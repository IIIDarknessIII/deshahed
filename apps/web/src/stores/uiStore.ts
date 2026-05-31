import { create } from "zustand";

export type MobileSheet = "alerts" | "stats" | null;
export type HeatmapPeriod = "day" | "week" | "month";

interface UiState {
  selectedLocationUid: number | null;
  selectedDroneId: number | null;
  mobileSheet: MobileSheet;
  heatmapOn: boolean;
  heatmapPeriod: HeatmapPeriod;
  sheltersOn: boolean;
  selectLocation: (uid: number | null) => void;
  selectDrone: (id: number | null) => void;
  setMobileSheet: (s: MobileSheet) => void;
  toggleMobileSheet: (s: Exclude<MobileSheet, null>) => void;
  setHeatmapOn: (v: boolean) => void;
  setHeatmapPeriod: (p: HeatmapPeriod) => void;
  setSheltersOn: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedLocationUid: null,
  selectedDroneId: null,
  mobileSheet: null,
  heatmapOn: false,
  heatmapPeriod: "week",
  sheltersOn: false,
  selectLocation: (uid) => set({ selectedLocationUid: uid }),
  selectDrone: (id) => set({ selectedDroneId: id }),
  setMobileSheet: (s) => set({ mobileSheet: s }),
  toggleMobileSheet: (s) =>
    set((state) => ({ mobileSheet: state.mobileSheet === s ? null : s })),
  setHeatmapOn: (v) => set({ heatmapOn: v }),
  setHeatmapPeriod: (p) => set({ heatmapPeriod: p }),
  setSheltersOn: (v) => set({ sheltersOn: v }),
}));
