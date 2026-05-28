"use client";

import { BarChart3, Siren } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useAlertsStore, selectAlertsList } from "@/stores/alertsStore";
import { useUiStore } from "@/stores/uiStore";

function NavButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative flex flex-1 items-center justify-center gap-2 py-3 text-sm " +
        (active ? "text-zinc-100" : "text-zinc-400")
      }
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-3 top-2 rounded-full bg-alert-active px-1.5 text-[10px] font-medium text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

export function MobileBottomNav() {
  const mobileSheet = useUiStore((s) => s.mobileSheet);
  const toggle = useUiStore((s) => s.toggleMobileSheet);
  const alerts = useAlertsStore(useShallow(selectAlertsList));

  return (
    <nav className="flex border-t border-border bg-bg/95 backdrop-blur md:hidden">
      <NavButton
        active={mobileSheet === "alerts"}
        onClick={() => toggle("alerts")}
        icon={<Siren size={18} />}
        label="Тривоги"
        badge={alerts.length}
      />
      <div className="w-px bg-border" />
      <NavButton
        active={mobileSheet === "stats"}
        onClick={() => toggle("stats")}
        icon={<BarChart3 size={18} />}
        label="Статистика"
      />
    </nav>
  );
}
