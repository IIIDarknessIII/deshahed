import { create } from "zustand";

export type MobileSheet = "alerts" | "stats" | null;
export type HeatmapPeriod = "day" | "week" | "month";

interface UiState {
  selectedLocationUid: number | null;
  mobileSheet: MobileSheet;
  heatmapOn: boolean;
  heatmapPeriod: HeatmapPeriod;
  selectLocation: (uid: number | null) => void;
  setMobileSheet: (s: MobileSheet) => void;
  toggleMobileSheet: (s: Exclude<MobileSheet, null>) => void;
  setHeatmapOn: (v: boolean) => void;
  setHeatmapPeriod: (p: HeatmapPeriod) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedLocationUid: null,
  mobileSheet: null,
  heatmapOn: false,
  heatmapPeriod: "week",
  selectLocation: (uid) => set({ selectedLocationUid: uid }),
  setMobileSheet: (s) => set({ mobileSheet: s }),
  toggleMobileSheet: (s) =>
    set((state) => ({ mobileSheet: state.mobileSheet === s ? null : s })),
  setHeatmapOn: (v) => set({ heatmapOn: v }),
  setHeatmapPeriod: (p) => set({ heatmapPeriod: p }),
}));
