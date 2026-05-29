import type { MetadataRoute } from "next";
import { REGIONS } from "@/lib/regions";
import { SUBREGIONS } from "@/lib/subregions_index";

const SITE = "https://xn----8sbkccc5iwa.online";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "always", priority: 1 },
    { url: `${SITE}/regions`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/stats`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}/timelapse`, lastModified: now, changeFrequency: "hourly", priority: 0.5 },
    { url: `${SITE}/embed`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    ...REGIONS.map((r) => ({
      url: `${SITE}/region/${r.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...SUBREGIONS.map((s) => ({
      url: `${SITE}/${s.type}/${s.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.4,
    })),
  ];
}
