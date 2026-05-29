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
      aria-pressed={active}
      className={
        "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors " +
        (active ? "text-zinc-100" : "text-zinc-400 active:text-zinc-200")
      }
    >
      {/* Active-tab indicator bar. */}
      <span
        className={
          "absolute inset-x-6 top-0 h-0.5 rounded-full transition-opacity " +
          (active ? "bg-alert-active opacity-100" : "opacity-0")
        }
      />
      <span className="relative">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-alert-active px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function MobileBottomNav() {
  const mobileSheet = useUiStore((s) => s.mobileSheet);
  const toggle = useUiStore((s) => s.toggleMobileSheet);
  const alerts = useAlertsStore(useShallow(selectAlertsList));

  return (
    <nav className="relative z-20 flex border-t border-border bg-bg/95 pb-[var(--safe-bottom)] backdrop-blur md:hidden">
      <NavButton
        active={mobileSheet === "alerts"}
        onClick={() => toggle("alerts")}
        icon={<Siren size={20} />}
        label="Тривоги"
        badge={alerts.length}
      />
      <div className="my-2 w-px bg-border" />
      <NavButton
        active={mobileSheet === "stats"}
        onClick={() => toggle("stats")}
        icon={<BarChart3 size={20} />}
        label="Статистика"
      />
    </nav>
  );
}
