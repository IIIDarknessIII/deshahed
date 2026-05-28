"use client";

import { useAlertsSocket } from "@/lib/ws";
import { Map } from "@/components/Map";
import { AlertsPanel } from "@/components/AlertsPanel";
import { StatsPanel } from "@/components/StatsPanel";
import { HistoryModal } from "@/components/HistoryModal";

export function AppShell() {
  useAlertsSocket();
  return (
    <main className="flex h-screen w-screen overflow-hidden">
      <AlertsPanel />
      <div className="relative h-full flex-1">
        <Map />
      </div>
      <StatsPanel />
      <HistoryModal />
    </main>
  );
}
