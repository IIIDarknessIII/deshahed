import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { HROMADA_BY_SLUG } from "@/lib/subregions_index";
import { SubRegionPage, subRegionMetadata } from "@/components/region/SubRegionPage";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 600;

// ~1320 hromadas — rendered on demand (ISR) rather than all at build time.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sub = HROMADA_BY_SLUG[slug];
  if (!sub) return { title: "Громада не знайдена" };
  return subRegionMetadata(sub);
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const sub = HROMADA_BY_SLUG[slug];
  if (!sub) notFound();
  return <SubRegionPage sub={sub} />;
}
