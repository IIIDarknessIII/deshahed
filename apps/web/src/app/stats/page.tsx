"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Period } from "@/lib/api";
import { Comparison } from "@/components/dashboard/Comparison";
import { DailyChart } from "@/components/dashboard/DailyChart";
import { DurationHistogram } from "@/components/dashboard/DurationHistogram";
import { TopRegions } from "@/components/dashboard/TopRegions";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Доба" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
  { value: "all", label: "Весь час" },
];

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>("week");

  return (
    <main className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/95 pt-[var(--safe-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="До карти"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="text-base font-semibold text-zinc-100">Статистика</div>
              <div className="text-xs text-zinc-500">deshahed</div>
            </div>
          </div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={
                  "shrink-0 rounded px-3 py-1.5 text-xs " +
                  (period === p.value
                    ? "bg-zinc-100 text-zinc-900"
                    : "border border-border text-zinc-300 hover:border-zinc-600")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-[max(1.5rem,var(--safe-bottom))]">
        <Comparison />

        <section className="rounded-md border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-100">
            Тривог по днях
          </h2>
          <DailyChart period={period} />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-md border border-border p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-100">
              Топ-10 регіонів за тривалістю
            </h2>
            <TopRegions period={period} />
          </section>

          <section className="rounded-md border border-border p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-100">
              Розподіл тривалості тривог
            </h2>
            <DurationHistogram period={period} />
          </section>
        </div>
      </div>
    </main>
  );
}
