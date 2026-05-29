"use client";

import { X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useAlertsStore, selectAlertsList } from "@/stores/alertsStore";
import { useUiStore } from "@/stores/uiStore";
import { formatDuration } from "@/lib/format";
import { alertTypeLabel } from "@/lib/labels";
import { OnlineBadge } from "@/components/OnlineBadge";
import { Panel } from "@/components/Panel";

export function AlertsPanel() {
  const connected = useAlertsStore((s) => s.connected);
  // selectAlertsList returns a fresh Array each call; useShallow keeps the
  // hook stable when the alert set hasn't actually changed.
  const alerts = useAlertsStore(useShallow(selectAlertsList));
  const setMobileSheet = useUiStore((s) => s.setMobileSheet);
  const now = Date.now();

  return (
    <Panel side="left" sheet="alerts">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-base font-semibold text-zinc-100">deshahed</div>
          <div className="text-xs text-zinc-500">карта тривог</div>
        </div>
        <div className="flex items-center gap-2">
          <OnlineBadge />
          <span
            className={
              "inline-flex h-2.5 w-2.5 rounded-full " +
              (connected ? "bg-emerald-500" : "bg-zinc-600")
            }
            title={connected ? "WS підключено" : "WS відключено"}
          />
          <button
            type="button"
            onClick={() => setMobileSheet(null)}
            className="-mr-1 flex h-9 w-9 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 md:hidden"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      <div className="shrink-0 px-4 py-3 text-xs uppercase tracking-wide text-zinc-500">
        Активних тривог: {alerts.length}
      </div>

      <ul className="flex-1 overflow-y-auto overscroll-contain">
        {alerts.length === 0 ? (
          <li className="px-4 py-6 text-sm text-zinc-500">
            Зараз тривог немає.
          </li>
        ) : (
          alerts.map((a) => (
            <li
              key={`${a.location_uid}:${a.alert_type}`}
              className="border-b border-border/60 px-4 py-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="truncate text-sm text-zinc-100">
                  {a.location_title}
                </div>
                <div className="shrink-0 text-xs text-alert-active tabular-nums">
                  {formatDuration(now - +new Date(a.started_at))}
                </div>
              </div>
              <div className="mt-0.5 text-xs text-zinc-400">{alertTypeLabel(a.alert_type)}</div>
            </li>
          ))
        )}
      </ul>

      <footer className="shrink-0 border-t border-border px-4 py-3 pb-[max(0.75rem,var(--safe-bottom))] text-[11px] leading-snug text-zinc-500">
        Дані з відкритих джерел (OSINT). Не використовуйте для прийняття рішень
        про безпеку. Офіційне джерело — застосунок «Повітряна тривога».
      </footer>
    </Panel>
  );
}
