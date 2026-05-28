"use client";

import { useAlertsSocket } from "@/lib/ws";
import { useDronesSocket } from "@/lib/dronesWs";
import { useTracksSocket } from "@/lib/tracksWs";
import { Map } from "@/components/Map";
import { AlertsPanel } from "@/components/AlertsPanel";
import { StatsPanel } from "@/components/StatsPanel";
import { HistoryModal } from "@/components/HistoryModal";
import { MobileBottomNav } from "@/components/MobileBottomNav";

export function AppShell() {
  useAlertsSocket();
  useDronesSocket();
  useTracksSocket();
  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden md:flex-row">
      <AlertsPanel />
      <div className="relative min-h-0 w-full flex-1">
        <Map />
      </div>
      <StatsPanel />
      <MobileBottomNav />
      <HistoryModal />
    </main>
  );
}
