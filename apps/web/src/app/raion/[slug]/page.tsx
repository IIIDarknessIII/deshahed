import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RAIONS, RAION_BY_SLUG } from "@/lib/subregions_index";
import { SubRegionPage, subRegionMetadata } from "@/components/region/SubRegionPage";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 600;

export function generateStaticParams() {
  return RAIONS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sub = RAION_BY_SLUG[slug];
  if (!sub) return { title: "Район не знайдено" };
  return subRegionMetadata(sub);
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const sub = RAION_BY_SLUG[slug];
  if (!sub) notFound();
  return await SubRegionPage({ sub });
}
