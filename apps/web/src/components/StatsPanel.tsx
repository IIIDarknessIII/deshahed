"use client";

import Link from "next/link";
import { Film, Flame, Heart, Info, LineChart, Smartphone, X } from "lucide-react";
import { SUPPORT_URL } from "@/lib/links";
import { useStatsSummary } from "@/hooks/useStats";
import { useUiStore, type HeatmapPeriod } from "@/stores/uiStore";
import { formatDuration } from "@/lib/format";
import { PushSubscribe } from "@/components/PushSubscribe";
import { AlertLegend } from "@/components/AlertLegend";
import { SoundToggle } from "@/components/SoundToggle";
import { ShelterToggle } from "@/components/ShelterToggle";
import { Panel } from "@/components/Panel";

const HEATMAP_PERIODS: { value: HeatmapPeriod; label: string }[] = [
  { value: "day", label: "Доба" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
        {value}
      </div>
    </div>
  );
}

export function StatsPanel() {
  const { data, isLoading, isError } = useStatsSummary("day");
  const setMobileSheet = useUiStore((s) => s.setMobileSheet);
  const heatmapOn = useUiStore((s) => s.heatmapOn);
  const setHeatmapOn = useUiStore((s) => s.setHeatmapOn);
  const heatmapPeriod = useUiStore((s) => s.heatmapPeriod);
  const setHeatmapPeriod = useUiStore((s) => s.setHeatmapPeriod);

  const totalAlerts = data?.total_alerts ?? 0;
  const totalDurationMin = data?.total_duration_minutes ?? 0;
  const top3 = (data?.by_oblast ?? []).slice(0, 3);

  return (
    <Panel side="right" sheet="stats">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-base font-semibold text-zinc-100">Статистика</div>
          <div className="text-xs text-zinc-500">за добу</div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/stats"
            className="flex h-9 w-9 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Детальна статистика"
            title="Детальна статистика"
          >
            <LineChart size={18} />
          </Link>
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

      <div className="flex-1 overflow-y-auto overscroll-contain pb-[var(--safe-bottom)]">
      <div className="space-y-2.5 px-4 py-3">
        <StatCard label="Всього тривог" value={String(totalAlerts)} />
        <StatCard
          label="Сумарний час"
          value={formatDuration(totalDurationMin * 60_000)}
        />
      </div>

      <div className="border-t border-border px-4 py-3 space-y-2">
        <PushSubscribe />
        <SoundToggle />
        <ShelterToggle />
        <Link
          href="/timelapse"
          className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-600"
          title="Анімація тривог за 24 години"
        >
          <span className="flex items-center gap-2">
            <Film size={14} />
            Тайм-лапс 24 год
          </span>
          <span className="text-[10px] uppercase tracking-wide">відкрити</span>
        </Link>

        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-between rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-200 transition hover:border-rose-400/80 hover:bg-rose-500/10"
          title="Підтримати проєкт"
        >
          <span className="flex items-center gap-2">
            <Heart size={14} className="fill-rose-500/70 text-rose-400" />
            Підтримати проєкт
          </span>
          <span className="text-[10px] uppercase tracking-wide">monobank</span>
        </a>

        <Link
          href="/about"
          className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-600"
          title="Джерела даних і методологія"
        >
          <span className="flex items-center gap-2">
            <Info size={14} />
            Про проєкт і джерела
          </span>
          <span className="text-[10px] uppercase tracking-wide">відкрити</span>
        </Link>

        {/* Desktop-only note — phone users get the install banner instead. */}
        <div className="hidden items-start gap-2 rounded-md border border-border bg-bg/60 px-3 py-2 text-[11px] leading-snug text-zinc-400 md:flex">
          <Smartphone size={14} className="mt-0.5 shrink-0 text-zinc-300" />
          <span>
            Є застосунок для телефону — відкрийте deshahed на смартфоні та
            встановіть його на головний екран.
          </span>
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <AlertLegend />
      </div>

      <div className="border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setHeatmapOn(!heatmapOn)}
          className={
            "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition " +
            (heatmapOn
              ? "border-alert-active bg-alert-active/10 text-alert-active"
              : "border-border text-zinc-300 hover:border-zinc-600")
          }
          aria-pressed={heatmapOn}
        >
          <span className="flex items-center gap-2">
            <Flame size={14} />
            Теплова карта БпЛА
          </span>
          <span className="text-[10px] uppercase tracking-wide">
            {heatmapOn ? "увімк." : "вимк."}
          </span>
        </button>
        {heatmapOn && (
          <div className="mt-2 flex gap-1.5">
            {HEATMAP_PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setHeatmapPeriod(p.value)}
                className={
                  "flex-1 rounded px-2 py-1 text-[11px] " +
                  (heatmapPeriod === p.value
                    ? "bg-zinc-100 text-zinc-900"
                    : "border border-border text-zinc-300 hover:border-zinc-600")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
          Топ-3 регіони (за тривалістю)
        </div>
        <ul className="mt-2 space-y-1.5">
          {isLoading && (
            <li className="text-xs text-zinc-500">Завантаження…</li>
          )}
          {isError && (
            <li className="text-xs text-rose-400">Помилка завантаження</li>
          )}
          {!isLoading && !isError && top3.length === 0 && (
            <li className="text-xs text-zinc-500">Поки немає даних</li>
          )}
          {top3.map((o, i) => (
            <li
              key={o.location_uid}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-4 text-zinc-500 tabular-nums">
                  {i + 1}.
                </span>
                <span className="truncate text-zinc-100">{o.location_title}</span>
              </span>
              <span className="shrink-0 text-xs text-zinc-400 tabular-nums">
                {formatDuration(o.duration_minutes * 60_000)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      </div>
    </Panel>
  );
}
