import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { REGIONS, REGION_BY_SLUG } from "@/lib/regions";
import { SUBREGIONS } from "@/lib/subregions_index";
import { RegionHistory } from "@/components/region/RegionHistory";
import { oblastStatus, statusSentence, STATE_LABEL } from "@/lib/serverStatus";

interface Props {
  params: Promise<{ slug: string }>;
}

const SITE = "https://xn----8sbkccc5iwa.online";

export const revalidate = 600;

export async function generateStaticParams() {
  return REGIONS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = REGION_BY_SLUG[slug];
  if (!r) return { title: "Регіон не знайдено" };
  const status = await oblastStatus(r.full_name_uk);
  const verdict = status.state === "safe" ? "тривоги немає" : STATE_LABEL[status.state];
  // Lead the title/description with the live verdict for the SERP snippet.
  const title = `${r.full_name_uk} — ${verdict} (зараз)`;
  const description = `${statusSentence(status)} на ${r.full_name_uk}. Карта повітряних тривог та БпЛА в реальному часі по районах і громадах. OSINT-моніторинг.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/region/${r.slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE}/region/${r.slug}`,
      siteName: "deshahed",
      locale: "uk_UA",
      type: "website",
      // og:image comes from the colocated opengraph-image.tsx (dynamic card).
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RegionPage({ params }: Props) {
  const { slug } = await params;
  const region = REGION_BY_SLUG[slug];
  if (!region) notFound();

  const children = SUBREGIONS.filter((s) => s.oblastSlug === region.slug);
  const raions = children.filter((s) => s.type === "raion");
  const hromadas = children.filter((s) => s.type === "hromada");

  const status = await oblastStatus(region.full_name_uk);
  const ssrSentence = statusSentence(status);
  const statusCls =
    status.state === "safe"
      ? "border-safe/50 bg-safe/10 text-safe"
      : status.state === "artillery_shelling"
        ? "border-artillery/50 bg-artillery/10 text-artillery"
        : status.state === "urban_fights"
          ? "border-street/50 bg-street/10 text-street"
          : "border-alert/50 bg-alert/10 text-alert";

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Чи є зараз повітряна тривога на ${region.full_name_uk}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${ssrSentence} на ${region.full_name_uk}. Стан тривоги оновлюється в реальному часі з alerts.in.ua та OSINT-моніторингу; деталі по районах і громадах — нижче на сторінці та на інтерактивній карті deshahed.`,
        },
      },
      {
        "@type": "Question",
        name: `Скільки районів і громад у ${region.full_name_uk}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `На ${region.full_name_uk} ми відстежуємо ${raions.length} район(ів) та ${hromadas.length} громад(и) — кожен має власну сторінку зі станом тривоги.`,
        },
      },
    ],
  };

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
            <div className="text-base font-semibold text-fg">{region.title}</div>
            <div className="text-xs text-fg-subtle">{region.full_name_uk}</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 pb-[max(1.5rem,var(--safe-bottom))]">
        <section className="rounded-lg border border-border p-4">
          <h1 className="mb-3 text-xl font-semibold text-fg">
            Повітряна тривога — {region.full_name_uk}
          </h1>
          <div className={`mb-3 flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium ${statusCls}`}>
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-current" />
            {ssrSentence}
          </div>
          <p className="text-sm leading-relaxed text-fg-muted">
            <strong className="text-fg">{ssrSentence}</strong> на{" "}
            {region.full_name_uk}. Ця сторінка показує стан повітряної тривоги та
            загроз (БпЛА, ракети, артобстріл) у реальному часі за даними
            alerts.in.ua та OSINT-моніторингу. Нижче — історія тривог за останні
            періоди та перелік {raions.length} районів і {hromadas.length} громад
            області, кожен зі своєю сторінкою. Загальну картину по всій країні
            дивіться на <Link className="underline hover:text-fg" href="/">інтерактивній карті</Link>.
          </p>
        </section>

        <RegionHistory
          regionUid={region.uid}
          regionTitle={region.title}
          oblastFullName={region.full_name_uk}
        />

        {(raions.length > 0 || hromadas.length > 0) && (
          <section className="rounded-lg border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold text-fg">
              Райони та громади області
            </h2>
            {raions.length > 0 && (
              <>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                  Райони
                </div>
                <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
                  {raions.map((s) => (
                    <Link
                      key={s.slug}
                      href={`/raion/${s.slug}`}
                      className="text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                    >
                      {s.name_uk}
                    </Link>
                  ))}
                </div>
              </>
            )}
            {hromadas.length > 0 && (
              <>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                  Громади
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {hromadas.map((s) => (
                    <Link
                      key={s.slug}
                      href={`/hromada/${s.slug}`}
                      className="text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                    >
                      {s.name_uk}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Карта тривог", item: SITE },
              {
                "@type": "ListItem",
                position: 2,
                name: region.full_name_uk,
                item: `${SITE}/region/${region.slug}`,
              },
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
      />
    </main>
  );
}
