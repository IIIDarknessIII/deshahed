import type { MetadataRoute } from "next";
import { REGIONS } from "@/lib/regions";

const SITE = "https://xn----8sbkccc5iwa.online";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "always", priority: 1 },
    { url: `${SITE}/stats`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    ...REGIONS.map((r) => ({
      url: `${SITE}/region/${r.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
