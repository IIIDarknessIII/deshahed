import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Map as MapIcon } from "lucide-react";
import type { SubRegion } from "@/lib/subregions_index";
import { SubRegionStatus } from "@/components/region/SubRegionStatus";
import { RegionHistory } from "@/components/region/RegionHistory";
import { subRegionStatus, statusSentence, STATE_LABEL } from "@/lib/serverStatus";

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
  // Lead the title with the live verdict so the SERP snippet answers the query.
  const verdict = status.state === "safe" ? "тривоги немає" : STATE_LABEL[status.state];
  const title = `${sub.name_uk} — ${verdict} (зараз)`;
  const description = `${statusSentence(status)} — ${kind(sub.type)} «${sub.name_uk}»${
    sub.oblast ? `, ${sub.oblast}` : ""
  }. Стан повітряної тривоги в реальному часі, дані з відкритих джерел (OSINT).`;
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
          text: `${ssrSentence}. Актуальний стан тривоги для ${kind(
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
            className="inline-flex items-center gap-1 rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="До карти"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-zinc-100">{sub.name_uk}</div>
            {sub.oblast && (
              <Link href={`/region/${sub.oblastSlug}`} className="text-xs text-zinc-500 hover:text-zinc-300">
                {sub.oblast}
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-[max(1.5rem,var(--safe-bottom))]">
        <section className="space-y-3">
          <h1 className="text-xl font-semibold text-zinc-100">
            Повітряна тривога — {sub.name_uk}
          </h1>
          <SubRegionStatus
            mkey={sub.mkey}
            initial={{ state: status.state, since: status.since }}
          />
          <p className="text-sm leading-relaxed text-zinc-400">
            <strong className="text-zinc-200">{ssrSentence}.</strong> Поточна ситуація з повітряними тривогами та загрозами для{" "}
            {kind(sub.type)} «{sub.name_uk}»
            {sub.oblast && (
              <>
                {" "}у складі{" "}
                <Link className="underline hover:text-zinc-200" href={`/region/${sub.oblastSlug}`}>
                  {sub.oblast}
                </Link>
              </>
            )}
            . Дані з відкритих джерел оновлюються в реальному часі. Дивіться загальну
            картину на{" "}
            <Link className="underline hover:text-zinc-200" href="/">
              інтерактивній карті
            </Link>
            .
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-600"
          >
            <MapIcon size={15} /> Відкрити карту
          </Link>
        </section>

        {sub.oblast && (
          <RegionHistory regionUid={0} regionTitle={sub.oblast} oblastFullName={sub.oblast} />
        )}

        <p className="text-[11px] leading-snug text-zinc-500">
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
