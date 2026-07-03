import type { MetadataRoute } from "next";
import { REGIONS } from "@/lib/regions";
import { SUBREGIONS } from "@/lib/subregions_index";

const SITE = "https://xn----8sbkccc5iwa.online";

// Frozen once per build (prod) rather than recomputed on every request. A
// sitemap whose <lastmod> changes on every fetch teaches Google the field is
// untrustworthy and wastes crawl budget on 1500 "just changed" URLs.
const LASTMOD = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, lastModified: LASTMOD, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/regions`, lastModified: LASTMOD, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/stats`, lastModified: LASTMOD, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/about`, lastModified: LASTMOD, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}/timelapse`, lastModified: LASTMOD, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE}/embed`, lastModified: LASTMOD, changeFrequency: "monthly", priority: 0.3 },
    // Oblasts — the strongest tier (real search demand, hand-checked content).
    ...REGIONS.map((r) => ({
      url: `${SITE}/region/${r.slug}`,
      lastModified: LASTMOD,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    // Raions — meaningful demand, ~155 pages.
    ...SUBREGIONS.filter((s) => s.type === "raion").map((s) => ({
      url: `${SITE}/${s.type}/${s.slug}`,
      lastModified: LASTMOD,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    // Hromadas — the long tail; honest low priority + weekly so we don't dilute
    // crawl budget claiming 1300 villages change daily.
    ...SUBREGIONS.filter((s) => s.type === "hromada").map((s) => ({
      url: `${SITE}/${s.type}/${s.slug}`,
      lastModified: LASTMOD,
      changeFrequency: "weekly" as const,
      priority: 0.3,
    })),
  ];
}
