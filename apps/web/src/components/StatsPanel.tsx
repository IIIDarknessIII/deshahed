"use client";

import { Clock, Film, Flame, Heart, Info, LineChart, Siren, Smartphone, X } from "lucide-react";
import { SUPPORT_URL } from "@/lib/links";
import { useStatsSummary } from "@/hooks/useStats";
import { useUiStore, type HeatmapPeriod } from "@/stores/uiStore";
import { formatDuration } from "@/lib/format";
import { PushSubscribe } from "@/components/PushSubscribe";
import { AlertLegend } from "@/components/AlertLegend";
import { SoundToggle } from "@/components/SoundToggle";
import { ShelterToggle } from "@/components/ShelterToggle";
import { BaseMapToggle } from "@/components/BaseMapToggle";
import { Panel } from "@/components/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { NavRow } from "@/components/ui/NavRow";
import { Segmented } from "@/components/ui/Segmented";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { IconButton } from "@/components/ui/IconButton";

const HEATMAP_PERIODS: { value: HeatmapPeriod; label: string }[] = [
  { value: "day", label: "Доба" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
      {children}
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
          <div className="text-[15px] font-semibold tracking-tight text-fg">Статистика</div>
          <div className="text-xs text-fg-subtle">за добу</div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton href="/stats" label="Детальна статистика">
            <LineChart size={18} />
          </IconButton>
          <IconButton
            label="Закрити"
            onClick={() => setMobileSheet(null)}
            className="-mr-1 md:hidden"
          >
            <X size={20} />
          </IconButton>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain pb-[var(--safe-bottom)]">
        <div className="grid grid-cols-2 gap-2.5 px-4 py-3">
          <StatCard
            label="Всього тривог"
            value={String(totalAlerts)}
            icon={<Siren size={12} />}
            accent="alert"
          />
          <StatCard
            label="Сумарний час"
            value={formatDuration(totalDurationMin * 60_000)}
            icon={<Clock size={12} />}
          />
        </div>

        <div className="space-y-2 border-t border-border px-4 py-3">
          <PushSubscribe />
          <SoundToggle />
          <ShelterToggle />
          <BaseMapToggle />

          <NavRow
            href="/timelapse"
            icon={<Film size={15} />}
            label="Тайм-лапс 24 год"
            hint="відкрити"
            title="Анімація тривог за 24 години"
          />
          <NavRow
            href={SUPPORT_URL}
            external
            emphasis
            icon={<Heart size={15} className="fill-alert/70 text-alert" />}
            label="Підтримати проєкт"
            hint="monobank"
            title="Підтримати проєкт"
          />
          <NavRow
            href="/about"
            icon={<Info size={15} />}
            label="Про проєкт і джерела"
            hint="відкрити"
            title="Джерела даних і методологія"
          />

          {/* Desktop-only note — phone users get the install banner instead. */}
          <div className="hidden items-start gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 text-[11px] leading-snug text-fg-muted md:flex">
            <Smartphone size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
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
          <ToggleRow
            icon={<Flame size={15} />}
            label="Теплова карта БпЛА"
            active={heatmapOn}
            accent="alert"
            onClick={() => setHeatmapOn(!heatmapOn)}
          />
          {heatmapOn && (
            <div className="mt-2">
              <Segmented
                options={HEATMAP_PERIODS}
                value={heatmapPeriod}
                onChange={setHeatmapPeriod}
                ariaLabel="Період теплової карти"
              />
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <SectionLabel>Топ-3 регіони · за тривалістю</SectionLabel>
          <ul className="space-y-1">
            {isLoading && <li className="py-1 text-xs text-fg-subtle">Завантаження…</li>}
            {isError && <li className="py-1 text-xs text-alert">Помилка завантаження</li>}
            {!isLoading && !isError && top3.length === 0 && (
              <li className="py-1 text-xs text-fg-subtle">Поки немає даних</li>
            )}
            {top3.map((o, i) => (
              <li
                key={o.location_uid}
                className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-2/50"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-2 font-mono text-[11px] font-semibold tabular-nums text-fg-muted">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm text-fg">{o.location_title}</span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-fg-muted">
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
