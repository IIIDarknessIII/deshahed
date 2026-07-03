"use client";

import { BarChart3, Siren } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useAlertsStore, selectAlertsList } from "@/stores/alertsStore";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/cn";

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
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors duration-150",
        active ? "text-fg" : "text-fg-subtle active:text-fg",
      )}
    >
      {/* Active-tab indicator bar (cool accent — selection, not alert). */}
      <span
        className={cn(
          "absolute inset-x-7 top-0 h-0.5 rounded-full bg-accent transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="relative">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-alert px-1 text-center font-mono text-[10px] font-semibold leading-4 tabular-nums text-white shadow-card">
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
    <nav className="relative z-20 flex border-t border-border bg-surface/95 pb-[var(--safe-bottom)] backdrop-blur-xl md:hidden">
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
