"use client";

const ITEMS: { label: string; color: string }[] = [
  { label: "Повітряна тривога", color: "bg-red-500/60" },
  { label: "Загроза артобстрілу", color: "bg-orange-500/60" },
  { label: "Загроза вуличних боїв", color: "bg-purple-500/70" },
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
            <span className={`inline-block h-3 w-3 rounded-sm ${it.color}`} />
            <span>{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
