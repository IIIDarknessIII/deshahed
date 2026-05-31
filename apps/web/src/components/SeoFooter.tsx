import Link from "next/link";
import { REGIONS } from "@/lib/regions";

/**
 * Crawlable link footer for the home page. The map itself is a <canvas>, so
 * Google sees no internal links there — this real, visible footer (below the
 * full-height map, reachable by scroll) gives the crawler paths into every
 * oblast page and the key sections, and doubles as a human site index.
 */
export function SeoFooter() {
  return (
    <footer className="border-t border-border bg-bg px-4 py-8 text-sm text-zinc-400">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 className="mb-3 text-base font-semibold text-zinc-100">
            Повітряні тривоги по областях України
          </h2>
          <nav className="flex flex-wrap gap-x-4 gap-y-1.5">
            {REGIONS.map((r) => (
              <Link
                key={r.slug}
                href={`/region/${r.slug}`}
                className="underline-offset-2 hover:text-zinc-100 hover:underline"
              >
                {r.full_name_uk}
              </Link>
            ))}
          </nav>
        </div>

        <nav className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border/60 pt-4">
          <Link href="/regions" className="hover:text-zinc-100 hover:underline">Усі регіони</Link>
          <Link href="/stats" className="hover:text-zinc-100 hover:underline">Статистика</Link>
          <Link href="/timelapse" className="hover:text-zinc-100 hover:underline">Тайм-лапс за добу</Link>
          <Link href="/embed" className="hover:text-zinc-100 hover:underline">Віджет для сайту</Link>
          <Link href="/about" className="hover:text-zinc-100 hover:underline">Про проєкт</Link>
          <a href="/deshahed.apk" download className="text-emerald-300 hover:text-emerald-200 hover:underline">Android-застосунок</a>
        </nav>

        <p className="border-t border-border/60 pt-4 text-[12px] leading-relaxed text-zinc-500">
          <strong className="text-zinc-400">deshahed</strong> — карта повітряних
          тривог, БпЛА та ракетної небезпеки в Україні в реальному часі. Дані з
          відкритих джерел (alerts.in.ua та OSINT-моніторинг). Не використовуйте
          для прийняття рішень про безпеку — офіційне джерело сповіщень є
          застосунок «Повітряна тривога».
        </p>
      </div>
    </footer>
  );
}
