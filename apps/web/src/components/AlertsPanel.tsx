"use client";

import { ShieldCheck, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useAlertsStore, selectAlertsList } from "@/stores/alertsStore";
import { useUiStore } from "@/stores/uiStore";
import { formatDuration } from "@/lib/format";
import { alertTypeLabel, alertTypeAccent, type AlertAccent } from "@/lib/labels";
import { cn } from "@/lib/cn";
import { OnlineBadge } from "@/components/OnlineBadge";
import { Panel } from "@/components/Panel";
import { LiveDot } from "@/components/ui/LiveDot";
import { IconButton } from "@/components/ui/IconButton";
import { BrandMark } from "@/components/ui/BrandMark";

// Accent → utility classes for a row's leading bar, dot and timer.
const ROW_BAR: Record<AlertAccent, string> = {
  alert: "bg-alert",
  artillery: "bg-artillery",
  street: "bg-street",
  warn: "bg-warn",
  muted: "bg-fg-faint",
};
const ROW_TIME: Record<AlertAccent, string> = {
  alert: "text-alert",
  artillery: "text-artillery",
  street: "text-street",
  warn: "text-warn",
  muted: "text-fg-muted",
};
const DOT_COLOR: Record<AlertAccent, "alert" | "warn" | "safe" | "accent" | "muted"> = {
  alert: "alert",
  artillery: "warn",
  street: "accent",
  warn: "warn",
  muted: "muted",
};

export function AlertsPanel() {
  const connected = useAlertsStore((s) => s.connected);
  // selectAlertsList returns a fresh Array each call; useShallow keeps the
  // hook stable when the alert set hasn't actually changed.
  const alerts = useAlertsStore(useShallow(selectAlertsList));
  const setMobileSheet = useUiStore((s) => s.setMobileSheet);
  const now = Date.now();
  const active = alerts.length > 0;

  return (
    <Panel side="left" sheet="alerts">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-tight text-fg">deshahed</div>
            <div className="text-xs text-fg-subtle">карта тривог</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <OnlineBadge />
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              connected
                ? "border-safe/25 bg-safe/10 text-safe"
                : "border-border bg-surface-2 text-fg-subtle",
            )}
            title={connected ? "Дані оновлюються в реальному часі" : "З'єднання втрачено"}
          >
            <LiveDot color={connected ? "safe" : "muted"} pulsing={connected} size={6} />
            {connected ? "live" : "офлайн"}
          </span>
          <IconButton
            label="Закрити"
            onClick={() => setMobileSheet(null)}
            className="-mr-1 md:hidden"
          >
            <X size={20} />
          </IconButton>
        </div>
      </header>

      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
          Активні тривоги
        </span>
        <span
          className={cn(
            "inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-2 py-0.5 font-mono text-sm font-semibold tabular-nums",
            active ? "bg-alert/15 text-alert" : "bg-surface-2 text-fg-subtle",
          )}
        >
          {alerts.length}
        </span>
      </div>

      <ul className="flex-1 overflow-y-auto overscroll-contain">
        {!active ? (
          <li className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-safe/25 bg-safe/10">
              <ShieldCheck size={22} className="text-safe" />
            </span>
            <div>
              <div className="text-sm font-medium text-fg">Зараз тривог немає</div>
              <div className="mt-1 text-xs text-fg-subtle">
                Мапа оновлюється автоматично, щойно з'явиться загроза.
              </div>
            </div>
          </li>
        ) : (
          alerts.map((a) => {
            const accent = alertTypeAccent(a.alert_type);
            return (
              <li
                key={`${a.location_uid}:${a.alert_type}`}
                className="animate-fade-in border-b border-border/60 transition-colors hover:bg-surface-2/50"
              >
                <div className="flex items-stretch gap-3 px-4 py-2.5">
                  <span className={cn("w-0.5 shrink-0 rounded-full", ROW_BAR[accent])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <LiveDot color={DOT_COLOR[accent]} size={7} pulsing={accent === "alert"} />
                        <span className="truncate text-sm text-fg">{a.location_title}</span>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-xs tabular-nums",
                          ROW_TIME[accent],
                        )}
                      >
                        {formatDuration(now - +new Date(a.started_at))}
                      </span>
                    </div>
                    <div className="mt-0.5 pl-4 text-xs text-fg-subtle">
                      {alertTypeLabel(a.alert_type)}
                    </div>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <footer className="flex shrink-0 items-start gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,var(--safe-bottom))] text-[11px] leading-snug text-fg-faint">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        <span>
          Дані з відкритих джерел (OSINT). Не використовуйте для прийняття рішень
          про безпеку. Офіційне джерело — застосунок «Повітряна тривога».
        </span>
      </footer>
    </Panel>
  );
}
