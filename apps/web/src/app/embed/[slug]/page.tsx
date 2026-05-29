import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { REGIONS, REGION_BY_SLUG } from "@/lib/regions";
import { EmbedStatus } from "@/components/embed/EmbedStatus";

interface Props {
  params: Promise<{ slug: string }>;
}

export const viewport: Viewport = { themeColor: "transparent" };

export async function generateStaticParams() {
  return REGIONS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = REGION_BY_SLUG[slug];
  if (!r) return { title: "embed" };
  return {
    // The root layout template is `%s · deshahed`; embed wants its own clean
    // title that screen-readers / share-cards can pull.
    title: `${r.full_name_uk} — статус тривоги · deshahed`,
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({ params }: Props) {
  const { slug } = await params;
  const region = REGION_BY_SLUG[slug];
  if (!region) notFound();

  return (
    <main className="h-screen w-screen overflow-hidden bg-transparent p-0">
      <EmbedStatus uid={region.uid} oblastTitle={region.full_name_uk} slug={region.slug} />
    </main>
  );
}
