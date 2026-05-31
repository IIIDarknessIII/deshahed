"use client";

import { useAlertsSocket } from "@/lib/ws";
import { useDronesSocket } from "@/lib/dronesWs";
import { useTracksSocket } from "@/lib/tracksWs";
import { Map } from "@/components/Map";
import { AlertsPanel } from "@/components/AlertsPanel";
import { StatsPanel } from "@/components/StatsPanel";
import { HistoryModal } from "@/components/HistoryModal";
import { DroneDetailModal } from "@/components/DroneDetailModal";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { AviationBanner } from "@/components/AviationBanner";
import { SupportButton } from "@/components/SupportButton";
import { DownloadAppButton } from "@/components/DownloadAppButton";
import { InstallPrompt } from "@/components/InstallPrompt";
import { useUiStore } from "@/stores/uiStore";

export function AppShell() {
  useAlertsSocket();
  useDronesSocket();
  useTracksSocket();

  const mobileSheet = useUiStore((s) => s.mobileSheet);
  const setMobileSheet = useUiStore((s) => s.setMobileSheet);

  return (
    // h-dvh tracks the *visible* viewport, so the layout never hides behind
    // the mobile browser's address bar the way 100vh does.
    <main className="flex h-dvh w-screen flex-col overflow-hidden md:flex-row">
      <AlertsPanel />
      <div className="relative min-h-0 w-full flex-1">
        <Map />
        <AviationBanner />
        <SupportButton />
        <DownloadAppButton />
      </div>
      <StatsPanel />

      {/* Tap-anywhere backdrop dims the map while a bottom sheet is open. */}
      {mobileSheet && (
        <button
          type="button"
          aria-label="Закрити панель"
          onClick={() => setMobileSheet(null)}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] md:hidden"
        />
      )}

      <InstallPrompt />
      <MobileBottomNav />
      <HistoryModal />
      <DroneDetailModal />
    </main>
  );
}
