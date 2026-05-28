import { create } from "zustand";

interface UiState {
  selectedLocationUid: number | null;
  selectLocation: (uid: number | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedLocationUid: null,
  selectLocation: (uid) => set({ selectedLocationUid: uid }),
}));
