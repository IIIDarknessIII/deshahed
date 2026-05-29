// Normalized match key for sub-oblast regions (raions / hromadas).
//
// alerts.in.ua and OSM spell hromada types differently — alerts.in.ua always
// says "...територіальна громада" while OSM uses the concrete type
// ("...міська/сільська/селищна громада"). We drop the type token from both so
// the names line up. Raions ("...район") already match verbatim.
//
// MUST stay byte-for-byte equivalent to mkey() in
// scripts/build_subregions_geojson.py, which stamps the `mkey` property on
// every feature in raions.geojson / hromadas.geojson.

const TYPE_TOKENS = new Set([
  "територіальна",
  "міська",
  "сільська",
  "селищна",
]);

export function subKey(title: string): string {
  const s = title
    .toLowerCase()
    .trim()
    .replace(/[’ʼ`‘'´]/g, "'");
  return s
    .split(/\s+/)
    .filter((t) => !TYPE_TOKENS.has(t))
    .join(" ");
}
