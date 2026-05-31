"use client";

import { X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUiStore } from "@/stores/uiStore";
import { useDronesStore } from "@/stores/dronesStore";
import { objectInfo, typicalSpeed, typicalAltitude, compass } from "@/lib/objectInfo";
import { ObjectIllustration } from "@/components/ObjectIllustration";
import { formatDuration } from "@/lib/format";

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-2">
      <span className="text-[12px] text-zinc-500">{label}</span>
      <span className="text-right text-sm text-zinc-100">{value}</span>
    </div>
  );
}

export function DroneDetailModal() {
  const selectedId = useUiStore((s) => s.selectedDroneId);
  const selectDrone = useUiStore((s) => s.selectDrone);
  const drone = useDronesStore(
    useShallow((s) => (selectedId !== null ? s.drones.get(selectedId) ?? null : null)),
  );

  if (selectedId === null) return null;

  // Drone may have expired/evicted while the modal was open.
  if (!drone) {
    return (
      <Overlay onClose={() => selectDrone(null)}>
        <div className="p-6 text-sm text-zinc-400">
          Об&apos;єкт більше не відстежується (мітка зникла).
        </div>
      </Overlay>
    );
  }

  const info = objectInfo(drone.event_type);
  const hasDir = drone.direction_lat !== null && drone.direction_lon !== null;
  const bearing = hasDir
    ? bearingDeg(drone.location_lat, drone.location_lon, drone.direction_lat as number, drone.direction_lon as number)
    : null;
  const c = bearing !== null ? compass(bearing) : null;
  const ageMs = Date.now() - +new Date(drone.detected_at);
  const confLabel = { high: "висока", medium: "середня", low: "низька" }[drone.confidence] ?? drone.confidence;

  return (
    <Overlay onClose={() => selectDrone(null)}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <div className="text-base font-semibold" style={{ color: info.accent }}>
            {info.label}
          </div>
          <div className="text-xs text-zinc-500">{info.fullName}</div>
        </div>
        <button
          type="button"
          onClick={() => selectDrone(null)}
          className="-mr-1 flex h-9 w-9 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Закрити"
        >
          <X size={20} />
        </button>
      </header>

      <div className="h-32 w-full shrink-0 border-b border-border">
        <ObjectIllustration type={drone.event_type} />
      </div>

      <div className="px-5 py-2">
        <Row
          label="Напрямок руху"
          value={
            c
              ? <>{c.name} <span className="text-zinc-400">({c.abbr}, {Math.round(bearing as number)}°)</span></>
              : <span className="text-zinc-500">невідомо</span>
          }
        />
        <Row label="Швидкість" value={<>{typicalSpeed(info)} <span className="text-zinc-500 text-xs">типова</span></>} />
        <Row label="Висота" value={<>{typicalAltitude(info)} <span className="text-zinc-500 text-xs">типова</span></>} />
        <Row label="Місце" value={drone.location_text || "—"} />
        {drone.direction_text && <Row label="У напрямку" value={drone.direction_text} />}
        <Row label="Виявлено" value={`${formatDuration(ageMs)} тому`} />
        <Row label="Достовірність" value={confLabel} />
      </div>

      <p className="px-5 pb-4 pt-1 text-sm leading-relaxed text-zinc-400">
        {info.description}
      </p>

      <p className="border-t border-border px-5 py-3 text-[11px] leading-snug text-zinc-500">
        Швидкість і висота — типові характеристики цього типу цілі, а не виміряні
        дані конкретного об&apos;єкта. Джерело — OSINT-моніторинг (@{drone.source_channel}).
        Не використовуйте для прийняття рішень про безпеку.
      </p>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="animate-sheet-up flex max-h-[88dvh] w-full max-w-md flex-col overflow-y-auto overflow-x-hidden rounded-t-2xl border border-border bg-bg shadow-2xl md:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 pb-1 pt-2.5 md:hidden">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-zinc-700" />
        </div>
        {children}
      </div>
    </div>
  );
}
