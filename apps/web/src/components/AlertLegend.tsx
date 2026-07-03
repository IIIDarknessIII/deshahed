"use client";

const ITEMS: { label: string; color: string }[] = [
  { label: "Повітряна тривога", color: "bg-alert/60" },
  { label: "Загроза артобстрілу", color: "bg-artillery/60" },
  { label: "Загроза вуличних боїв", color: "bg-street/70" },
  { label: "Немає інформації про тривогу", color: "bg-surface-3" },
];

// Compact glyphs mirroring the on-map icons (viewBox matches Map.tsx).
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 32 32" className="h-4 w-4 shrink-0" aria-hidden>
      {children}
    </svg>
  );
}

const ICONS: { node: React.ReactNode; label: string }[] = [
  {
    label: "Ракета",
    node: (
      <Glyph>
        <path
          d="M16 2 C20 7 20.5 12 20.5 17 L20.5 23 L11.5 23 L11.5 17 C11.5 12 12 7 16 2 Z M11.5 19 L6.5 26 L11.5 23 Z M20.5 19 L25.5 26 L20.5 23 Z"
          fill="#dc2626"
          stroke="#0a0a0b"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      </Glyph>
    ),
  },
  {
    label: "Шахед / БпЛА",
    node: (
      <Glyph>
        <path d="M16 3 L28 25 L16 20 L4 25 Z" fill="#fb923c" stroke="#0a0a0b" strokeWidth={1.5} strokeLinejoin="round" />
      </Glyph>
    ),
  },
  {
    label: "Розвідувальний БпЛА",
    node: (
      <Glyph>
        <path d="M16 3 L28 25 L16 20 L4 25 Z" fill="#2dd4bf" stroke="#0a0a0b" strokeWidth={1.5} strokeLinejoin="round" />
      </Glyph>
    ),
  },
  {
    label: "КАБ",
    node: (
      <Glyph>
        <path d="M16 3 L28 25 L16 20 L4 25 Z" fill="#a855f7" stroke="#0a0a0b" strokeWidth={1.5} strokeLinejoin="round" />
      </Glyph>
    ),
  },
  {
    label: "Загроза артобстрілу",
    node: (
      <Glyph>
        <path
          d="M16 3 L19 12 L28 9 L21 16 L28 23 L19 20 L16 29 L13 20 L4 23 L11 16 L4 9 L13 12 Z"
          fill="#f97316"
          stroke="#0a0a0b"
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
      </Glyph>
    ),
  },
  {
    label: "Напрямок руху (куди летить)",
    node: (
      <Glyph>
        <path d="M16 5 L26 25 L16 19 L6 25 Z" fill="#fca5a5" stroke="#0a0a0b" strokeWidth={1.4} strokeLinejoin="round" />
      </Glyph>
    ),
  },
];

export function AlertLegend() {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        Стани
      </div>
      <ul className="space-y-1.5">
        {ITEMS.map((it) => (
          <li key={it.label} className="flex items-center gap-2.5 text-[12px] text-fg-muted">
            <span className={`inline-block h-3 w-3 rounded-sm ring-1 ring-inset ring-white/10 ${it.color}`} />
            <span>{it.label}</span>
          </li>
        ))}
      </ul>

      <div className="mb-2 mt-3 border-t border-border/60 pt-2.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        Значки
      </div>
      <ul className="space-y-1.5">
        {ICONS.map((it) => (
          <li key={it.label} className="flex items-center gap-2.5 text-[12px] text-fg-muted">
            {it.node}
            <span>{it.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-2.5 border-t border-border/60 pt-2 text-[11px] leading-snug text-fg-faint">
        Наближайте карту, щоб побачити ситуацію по районах і громадах.
      </div>
    </div>
  );
}
