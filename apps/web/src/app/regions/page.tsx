import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { REGIONS } from "@/lib/regions";
import { RAIONS } from "@/lib/subregions_index";

const SITE = "https://xn----8sbkccc5iwa.online";

export const metadata: Metadata = {
  title: "Регіони України — карта повітряних тривог",
  description:
    "Усі області, райони та громади України на карті повітряних тривог. Оберіть свій регіон, щоб дивитися стан тривоги в реальному часі.",
  alternates: { canonical: `${SITE}/regions` },
  openGraph: {
    title: "Регіони України — карта повітряних тривог",
    description: "Усі області та райони України — стан повітряної тривоги в реальному часі.",
    url: `${SITE}/regions`,
    siteName: "deshahed",
    locale: "uk_UA",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "deshahed — регіони" }],
  },
};

export default function RegionsIndexPage() {
  const raionsByOblast = new Map<string, typeof RAIONS>();
  for (const r of RAIONS) {
    const list = raionsByOblast.get(r.oblastSlug) ?? [];
    list.push(r);
    raionsByOblast.set(r.oblastSlug, list);
  }

  return (
    <main className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/95 pt-[var(--safe-top)] backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="До карти"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="text-base font-semibold text-fg">Регіони України</div>
            <div className="text-xs text-fg-subtle">повітряні тривоги по регіонах</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 pb-[max(1.5rem,var(--safe-bottom))]">
        <h1 className="text-xl font-semibold text-fg">
          Повітряні тривоги по регіонах України
        </h1>
        <p className="text-sm text-fg-muted">
          Оберіть область, район або громаду, щоб дивитися стан повітряної тривоги
          в реальному часі. Громади кожної області — на її сторінці.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {REGIONS.map((region) => {
            const raions = raionsByOblast.get(region.slug) ?? [];
            return (
              <section key={region.slug} className="rounded-lg border border-border p-4">
                <Link
                  href={`/region/${region.slug}`}
                  className="text-sm font-semibold text-fg hover:underline"
                >
                  {region.full_name_uk}
                </Link>
                {raions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {raions.map((s) => (
                      <Link
                        key={s.slug}
                        href={`/raion/${s.slug}`}
                        className="text-[13px] text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                      >
                        {s.name_uk}
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
