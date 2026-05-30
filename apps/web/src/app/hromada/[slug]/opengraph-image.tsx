import { HROMADA_BY_SLUG } from "@/lib/subregions_index";
import { renderOg } from "@/lib/og";

export const runtime = "nodejs";
export const alt = "deshahed — карта повітряних тривог";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sub = HROMADA_BY_SLUG[slug];
  return renderOg({
    title: sub ? sub.name_uk : "Повітряна тривога",
    subtitle: sub?.oblast || "Україна",
    accent: "#f97316",
  });
}
