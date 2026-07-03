import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Map as MapIcon } from "lucide-react";
import type { SubRegion } from "@/lib/subregions_index";
import { SubRegionStatus } from "@/components/region/SubRegionStatus";
import { RegionHistory } from "@/components/region/RegionHistory";
import {
  subRegionStatus,
  subRegionHistory,
  statusSentence,
  STATE_LABEL,
} from "@/lib/serverStatus";
import { formatDuration } from "@/lib/format";
import { siblingsInOblast, oblastChildCounts } from "@/lib/subregionRelations";

// How many sibling links to inline per page — enough for real crawl paths and
// unique-per-page content without turning each page into a link farm.
const MAX_SIBLINGS = 30;

const SITE = "https://xn----8sbkccc5iwa.online";

function basePath(type: SubRegion["type"]): string {
  return type === "raion" ? "/raion" : "/hromada";
}

function kind(type: SubRegion["type"]): string {
  return type === "raion" ? "району" : "громади";
}

export async function subRegionMetadata(sub: SubRegion): Promise<Metadata> {
  const url = `${SITE}${basePath(sub.type)}/${sub.slug}`;
  const status = await subRegionStatus(sub.mkey);
  const hist = sub.oblast
    ? await subRegionHistory(sub.mkey, sub.oblast)
    : { count: 0, totalMinutes: 0, lastStartedAt: null };
  // Lead the title with the live verdict so the SERP snippet answers the query.
  const verdict = status.state === "safe" ? "тривоги немає" : STATE_LABEL[status.state];
  const title = sub.oblast
    ? `${sub.name_uk}, ${sub.oblast} — ${verdict} (зараз)`
    : `${sub.name_uk} — ${verdict} (зараз)`;
  const stat30 = hist.count > 0 ? ` За 30 днів зафіксовано ${hist.count} тривог.` : "";
  const description = `${statusSentence(status)} — ${kind(sub.type)} «${sub.name_uk}»${
    sub.oblast ? `, ${sub.oblast}` : ""
  }.${stat30} Стан повітряної тривоги в реальному часі, дані з відкритих джерел (OSINT).`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "deshahed",
      locale: "uk_UA",
      type: "website",
      // og:image comes from the colocated opengraph-image.tsx (dynamic card).
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export async function SubRegionPage({ sub }: { sub: SubRegion }) {
  const url = `${SITE}${basePath(sub.type)}/${sub.slug}`;
  const status = await subRegionStatus(sub.mkey);
  const ssrSentence = statusSentence(status);

  // Unique-per-page context: real oblast counts + lateral sibling links.
  const siblings = siblingsInOblast(sub);
  const counts = sub.oblastSlug ? oblastChildCounts(sub.oblastSlug) : { raions: 0, hromadas: 0 };
  const siblingRaions = siblings.filter((s) => s.type === "raion").slice(0, MAX_SIBLINGS);
  const siblingHromadas = siblings.filter((s) => s.type === "hromada").slice(0, MAX_SIBLINGS);

  // Real per-sub-region 30-day stats — the unique-content lever.
  const hist = sub.oblast
    ? await subRegionHistory(sub.mkey, sub.oblast)
    : { count: 0, totalMinutes: 0, lastStartedAt: null };
  const lastAgo =
    hist.lastStartedAt !== null
      ? formatDuration(Date.now() - +new Date(hist.lastStartedAt))
      : null;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Карта тривог", item: SITE },
      ...(sub.oblastSlug
        ? [{ "@type": "ListItem", position: 2, name: sub.oblast, item: `${SITE}/region/${sub.oblastSlug}` }]
        : []),
      { "@type": "ListItem", position: sub.oblastSlug ? 3 : 2, name: sub.name_uk, item: url },
    ],
  };

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Чи є зараз повітряна тривога в «${sub.name_uk}»?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${ssrSentence}.${
            hist.count > 0
              ? ` За останні 30 днів для ${kind(sub.type)} «${sub.name_uk}» зафіксовано ${hist.count} тривог загальною тривалістю ${formatDuration(hist.totalMinutes * 60_000)}.`
              : ""
          } Актуальний стан тривоги для ${kind(
            sub.type,
          )} «${sub.name_uk}» оновлюється в реальному часі на цій сторінці та на інтерактивній карті deshahed. Джерело — alerts.in.ua та OSINT-моніторинг.`,
        },
      },
    ],
  };

  return (
    <main className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/95 pt-[var(--safe-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="До карти"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-fg">{sub.name_uk}</div>
            {sub.oblast && (
              <Link href={`/region/${sub.oblastSlug}`} className="text-xs text-fg-subtle hover:text-fg-muted">
                {sub.oblast}
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-[max(1.5rem,var(--safe-bottom))]">
        <section className="space-y-3">
          <h1 className="text-xl font-semibold text-fg">
            Повітряна тривога — {sub.name_uk}
          </h1>
          <SubRegionStatus
            mkey={sub.mkey}
            initial={{ state: status.state, since: status.since }}
          />
          <p className="text-sm leading-relaxed text-fg-muted">
            <strong className="text-fg">{ssrSentence}.</strong> Поточна ситуація з повітряними тривогами та загрозами для{" "}
            {kind(sub.type)} «{sub.name_uk}»
            {sub.oblast && (
              <>
                {" "}у складі{" "}
                <Link className="underline hover:text-fg" href={`/region/${sub.oblastSlug}`}>
                  {sub.oblast}
                </Link>
              </>
            )}
            . Дані з відкритих джерел оновлюються в реальному часі. Дивіться загальну
            картину на{" "}
            <Link className="underline hover:text-fg" href="/">
              інтерактивній карті
            </Link>
            .
          </p>
          {sub.oblast && counts.raions + counts.hromadas > 0 && (
            <p className="text-sm leading-relaxed text-fg-muted">
              «{sub.name_uk}» — {sub.type === "raion" ? "район" : "громада"} у складі{" "}
              <Link className="underline hover:text-fg" href={`/region/${sub.oblastSlug}`}>
                {sub.oblast}
              </Link>
              , де deshahed відстежує {counts.raions} районів та {counts.hromadas} громад,
              кожен зі своєю сторінкою стану тривоги.
            </p>
          )}
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-fg-muted transition hover:border-border-strong"
          >
            <MapIcon size={15} /> Відкрити карту
          </Link>
        </section>

        {hist.count > 0 && (
          <section className="rounded-lg border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold text-fg">
              Статистика тривог за 30 днів — {sub.name_uk}
            </h2>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                  Тривог
                </div>
                <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-fg">
                  {hist.count}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                  Сумарний час
                </div>
                <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-fg">
                  {formatDuration(hist.totalMinutes * 60_000)}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                  Остання
                </div>
                <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-fg">
                  {lastAgo ? `${lastAgo} тому` : "—"}
                </div>
              </div>
            </div>
          </section>
        )}

        {sub.oblast && (
          <RegionHistory
            regionTitle={sub.name_uk}
            oblastFullName={sub.oblast}
            subregionMkey={sub.mkey}
          />
        )}

        {(siblingRaions.length > 0 || siblingHromadas.length > 0) && (
          <section className="rounded-lg border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold text-fg">
              Сусідні райони та громади{sub.oblast ? ` — ${sub.oblast}` : ""}
            </h2>
            {siblingRaions.length > 0 && (
              <>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                  Райони
                </div>
                <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
                  {siblingRaions.map((s) => (
                    <Link
                      key={`r-${s.slug}`}
                      href={`/raion/${s.slug}`}
                      className="text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                    >
                      {s.name_uk}
                    </Link>
                  ))}
                </div>
              </>
            )}
            {siblingHromadas.length > 0 && (
              <>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                  Громади
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {siblingHromadas.map((s) => (
                    <Link
                      key={`h-${s.slug}`}
                      href={`/hromada/${s.slug}`}
                      className="text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                    >
                      {s.name_uk}
                    </Link>
                  ))}
                </div>
              </>
            )}
            {sub.oblastSlug && (
              <Link
                href={`/region/${sub.oblastSlug}`}
                className="mt-3 inline-block text-sm text-accent underline-offset-2 hover:underline"
              >
                Усі райони та громади — {sub.oblast} →
              </Link>
            )}
          </section>
        )}

        <p className="text-[11px] leading-snug text-fg-subtle">
          Дані з відкритих джерел (OSINT) та alerts.in.ua. Не використовуйте для
          прийняття рішень про безпеку. Офіційне джерело — застосунок «Повітряна тривога».
        </p>
      </div>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
      />
    </main>
  );
}
