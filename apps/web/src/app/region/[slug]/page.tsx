import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { REGIONS, REGION_BY_SLUG } from "@/lib/regions";
import { RegionHistory } from "@/components/region/RegionHistory";

interface Props {
  params: Promise<{ slug: string }>;
}

const SITE = "https://xn----8sbkccc5iwa.online";

export async function generateStaticParams() {
  return REGIONS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = REGION_BY_SLUG[slug];
  if (!r) return { title: "Регіон не знайдено" };
  // The root metadata template already appends " · deshahed".
  const title = `${r.title} — карта повітряних тривог`;
  const description = `Реальний час повітряних тривог та БпЛА на ${r.full_name_uk}. OSINT-моніторинг.`;
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
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function RegionPage({ params }: Props) {
  const { slug } = await params;
  const region = REGION_BY_SLUG[slug];
  if (!region) notFound();

  return (
    <main className="min-h-screen bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="До карти"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="text-base font-semibold text-zinc-100">{region.title}</div>
            <div className="text-xs text-zinc-500">{region.full_name_uk}</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <section className="rounded-md border border-border p-4">
          <h1 className="mb-2 text-xl font-semibold text-zinc-100">
            {region.full_name_uk} — повітряні тривоги
          </h1>
          <p className="text-sm text-zinc-400">
            Реальний час подій з відкритих джерел. Дивіться поточну ситуацію
            на <Link className="underline" href="/">інтерактивній карті</Link>.
          </p>
        </section>

        <RegionHistory regionUid={region.uid} regionTitle={region.title} />
      </div>
    </main>
  );
}
