// Oblast → children relations, derived once from the auto-generated index.
// Used to give each raion/hromada page unique lateral internal links (sibling
// regions) and real counts, instead of 1500 near-identical thin pages.

import { SUBREGIONS, type SubRegion } from "@/lib/subregions_index";
import { subKey } from "@/lib/subregions";

// (normalized name + oblast) → SubRegion, for resolving a DB alert row back to
// its landing page. Oblast disambiguates the ~148 same-named hromadas.
const byKeyOblast = new Map<string, SubRegion>();
for (const s of SUBREGIONS) byKeyOblast.set(`${s.mkey}|${s.oblast}`, s);

/** Resolve a raw alert location_title + oblast to its raion/hromada page. */
export function findSubRegion(title: string, oblast: string): SubRegion | null {
  return byKeyOblast.get(`${subKey(title)}|${oblast}`) ?? null;
}

const byOblast = new Map<string, SubRegion[]>();
for (const s of SUBREGIONS) {
  const arr = byOblast.get(s.oblastSlug);
  if (arr) arr.push(s);
  else byOblast.set(s.oblastSlug, [s]);
}

function same(a: SubRegion, b: SubRegion): boolean {
  return a.slug === b.slug && a.type === b.type;
}

/** Other raions/hromadas in the same oblast (self excluded), name-sorted. */
export function siblingsInOblast(sub: SubRegion): SubRegion[] {
  return (byOblast.get(sub.oblastSlug) ?? [])
    .filter((s) => !same(s, sub))
    .sort((a, b) => a.name_uk.localeCompare(b.name_uk, "uk"));
}

export function oblastChildCounts(oblastSlug: string): { raions: number; hromadas: number } {
  const all = byOblast.get(oblastSlug) ?? [];
  let raions = 0;
  let hromadas = 0;
  for (const s of all) (s.type === "raion" ? raions++ : hromadas++);
  return { raions, hromadas };
}
