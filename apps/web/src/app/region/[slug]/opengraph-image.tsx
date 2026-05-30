import { REGION_BY_SLUG } from "@/lib/regions";
import { renderOg } from "@/lib/og";

export const runtime = "nodejs";
export const alt = "deshahed — карта повітряних тривог";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const region = REGION_BY_SLUG[slug];
  return renderOg({
    title: region ? region.full_name_uk : "Повітряна тривога",
    subtitle: "Повітряна тривога зараз",
  });
}
