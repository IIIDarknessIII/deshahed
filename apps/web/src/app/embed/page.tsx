"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";
import { REGIONS } from "@/lib/regions";

const SIZES: { label: string; w: number; h: number }[] = [
  { label: "Стандартний 320 × 120", w: 320, h: 120 },
  { label: "Широкий 480 × 100",      w: 480, h: 100 },
  { label: "Компактний 220 × 90",   w: 220, h: 90 },
];

export default function EmbedDocsPage() {
  const [slug, setSlug] = useState<string>(REGIONS[0].slug);
  const [size, setSize] = useState(SIZES[0]);
  const [copied, setCopied] = useState(false);

  const url = `https://xn----8sbkccc5iwa.online/embed/${slug}`;
  const snippet = useMemo(
    () =>
      `<iframe src="${url}" width="${size.w}" height="${size.h}" frameborder="0" loading="lazy" style="border:0;border-radius:8px;overflow:hidden" title="deshahed — статус тривоги"></iframe>`,
    [url, size],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* user can copy manually */
    }
  };

  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-6 px-4 py-8 pt-[max(2rem,var(--safe-top))] pb-[max(2rem,var(--safe-bottom))] text-zinc-100">
      <header>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← На карту
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Вбудовуваний віджет</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Один рядок HTML — статус повітряної тривоги у вашій області, що оновлюється сам.
          Підходить для стрімів, особистих сайтів та внутрішніх дашбордів.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wide text-zinc-500">Область</label>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-md border border-border bg-bg/60 px-3 py-2 text-sm"
          >
            {REGIONS.map((r) => (
              <option key={r.slug} value={r.slug}>{r.full_name_uk}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wide text-zinc-500">Розмір</label>
          <select
            value={size.label}
            onChange={(e) => setSize(SIZES.find((s) => s.label === e.target.value) ?? SIZES[0])}
            className="w-full rounded-md border border-border bg-bg/60 px-3 py-2 text-sm"
          >
            {SIZES.map((s) => (
              <option key={s.label} value={s.label}>{s.label}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-zinc-500">Прев'ю</div>
        <div className="overflow-x-auto rounded-md border border-border bg-zinc-900 p-4">
          <iframe
            key={url + size.label}
            src={url}
            width={size.w}
            height={size.h}
            frameBorder={0}
            loading="lazy"
            style={{ border: 0, borderRadius: 8, overflow: "hidden" }}
            title="deshahed — статус тривоги"
          />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-zinc-500">HTML</div>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-zinc-200 hover:border-zinc-600"
          >
            <Copy size={12} />
            {copied ? "Скопійовано" : "Скопіювати"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-md border border-border bg-zinc-900 p-3 text-[12px] leading-relaxed text-zinc-200">
          <code>{snippet}</code>
        </pre>
      </section>

      <section className="rounded-md border border-border p-4 text-xs leading-relaxed text-zinc-400">
        <p className="mb-1.5 font-semibold text-zinc-300">Як працює</p>
        Віджет оновлює стан кожні 15 секунд напряму з нашого API. Колір тла, назва
        стану українською мовою та тривалість оновлюються автоматично. Клік на віджет
        веде на сторінку регіону.
        <br /><br />
        Безкоштовно, без обмежень кількості показів. Атрибуція «deshahed.online»
        бажана, але не обов'язкова.
      </section>
    </main>
  );
}
