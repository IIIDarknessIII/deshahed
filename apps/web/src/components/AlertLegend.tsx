"use client";

/** Legend mapping the 6 alert states from the TZ to map colors. */
const ITEMS: { label: string; color: string; border?: string }[] = [
  { label: "Повітряна тривога", color: "bg-red-500/60" },
  { label: "Ударні/імітаційні БпЛА", color: "bg-red-700/70" },
  { label: "Загроза артобстрілу", color: "bg-orange-500/60" },
  { label: "Загроза вуличних боїв", color: "bg-purple-500/70" },
  { label: "Потенційні загрози", color: "bg-amber-500/40", border: "border border-amber-500/60" },
  { label: "Немає інформації про тривогу", color: "bg-zinc-800/80" },
];

export function AlertLegend() {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Стани
      </div>
      <ul className="space-y-1.5">
        {ITEMS.map((it) => (
          <li key={it.label} className="flex items-center gap-2 text-[12px] text-zinc-300">
            <span className={`inline-block h-3 w-3 rounded-sm ${it.color} ${it.border ?? ""}`} />
            <span>{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
