"""Build apps/web/src/lib/subregions_index.ts from the geojson layers.

For every raion (admin level 6) and hromada (level 7) it emits:
  - slug          : URL-safe transliteration (unique within its type)
  - name_uk       : "Ізюмський район" / "Нікопольська міська громада"
  - mkey          : normalized match key (see lib/subregions.ts)
  - type          : "raion" | "hromada"
  - oblast        : containing oblast full name (point-in-polygon)
  - oblastSlug    : that oblast's /region/<slug>

This is what the /raion/[slug] and /hromada/[slug] SEO pages, the /regions
index, and the sitemap are generated from.

Requires: shapely.  PYTHONPATH=/tmp/geolibs python3 scripts/build_subregion_index.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from shapely.geometry import shape  # type: ignore
from shapely.prepared import prep  # type: ignore

REPO_ROOT = Path(__file__).resolve().parent.parent
GEO_DIR = REPO_ROOT / "apps" / "web" / "public" / "geo"
OUT = REPO_ROOT / "apps" / "web" / "src" / "lib" / "subregions_index.ts"

# Oblast full name → /region/<slug>, mirroring apps/web/src/lib/regions.ts.
OBLAST_SLUG = {
    "Вінницька область": "vinnytsia",
    "Волинська область": "volyn",
    "Дніпропетровська область": "dnipropetrovsk",
    "Донецька область": "donetsk",
    "Житомирська область": "zhytomyr",
    "Закарпатська область": "zakarpattia",
    "Запорізька область": "zaporizhzhia",
    "Івано-Франківська область": "ivano-frankivsk",
    "Київська область": "kyiv-oblast",
    "Кіровоградська область": "kirovohrad",
    "Луганська область": "luhansk",
    "Львівська область": "lviv",
    "Миколаївська область": "mykolaiv",
    "Одеська область": "odesa",
    "Полтавська область": "poltava",
    "Рівненська область": "rivne",
    "Сумська область": "sumy",
    "Тернопільська область": "ternopil",
    "Харківська область": "kharkiv",
    "Херсонська область": "kherson",
    "Хмельницька область": "khmelnytskyi",
    "Черкаська область": "cherkasy",
    "Чернівецька область": "chernivtsi",
    "Чернігівська область": "chernihiv",
    "м. Київ": "kyiv",
    "м. Севастополь": "sevastopol",
    "Автономна Республіка Крим": "krym",
}

# Ukrainian → Latin for slugs (simplified national 2010 romanization).
_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "h", "ґ": "g", "д": "d", "е": "e",
    "є": "ie", "ж": "zh", "з": "z", "и": "y", "і": "i", "ї": "i", "й": "i",
    "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch",
    "ш": "sh", "щ": "shch", "ь": "", "ю": "iu", "я": "ia", "'": "", "’": "",
}

# Generic tokens dropped from the slug (the route already says raion/hromada).
_DROP = {"район", "територіальна", "міська", "сільська", "селищна", "громада"}
_TYPE_TOKENS = {"територіальна", "міська", "сільська", "селищна"}
_APOSTROPHE_RE = re.compile(r"[’ʼ`‘'´]")


def mkey(name: str) -> str:
    """Match key — MUST match lib/subregions.ts subKey()."""
    s = _APOSTROPHE_RE.sub("'", name.lower().strip())
    return " ".join(t for t in s.split() if t not in _TYPE_TOKENS)


def slugify(name: str) -> str:
    tokens = [t for t in name.lower().split() if t not in _DROP]
    out = []
    for ch in " ".join(tokens):
        if ch in _TRANSLIT:
            out.append(_TRANSLIT[ch])
        elif ch.isalnum():
            out.append(ch)
        else:
            out.append(" ")
    return re.sub(r"-+", "-", "-".join("".join(out).split())).strip("-")


def load(name: str) -> list[dict]:
    return json.loads((GEO_DIR / name).read_text())["features"]


def oblast_finder():
    feats = load("oblasts.geojson")
    polys = []
    for f in feats:
        title = (f.get("properties") or {}).get("full_name_uk")
        if not title:
            continue
        g = shape(f["geometry"])
        polys.append((title, prep(g), g))

    def find(geom: dict) -> str | None:
        pt = shape(geom).representative_point()
        for title, pg, _ in polys:
            if pg.contains(pt):
                return title
        # Fallback: nearest oblast by centroid distance (border/simplification).
        return min(polys, key=lambda p: p[2].distance(pt))[0] if polys else None

    return find


def build(layer_file: str, type_: str, find_oblast) -> list[dict]:
    out = []
    seen: set[str] = set()
    for f in load(layer_file):
        name = (f.get("properties") or {}).get("name_uk")
        if not name:
            continue
        oblast = find_oblast(f["geometry"])
        base = slugify(name) or "region"
        slug = base
        if slug in seen:
            alt = f"{base}-{OBLAST_SLUG.get(oblast, 'ua')}"
            slug = alt
            i = 2
            while slug in seen:
                slug = f"{alt}-{i}"
                i += 1
        seen.add(slug)
        out.append(
            {
                "slug": slug,
                "name_uk": name,
                "mkey": mkey(name),
                "type": type_,
                "oblast": oblast or "",
                "oblastSlug": OBLAST_SLUG.get(oblast or "", ""),
            }
        )
    out.sort(key=lambda r: r["slug"])
    return out


def main() -> int:
    find_oblast = oblast_finder()
    raions = build("raions.geojson", "raion", find_oblast)
    hromadas = build("hromadas.geojson", "hromada", find_oblast)
    rows = raions + hromadas

    body = ",\n".join(
        "  {"
        + f'slug:{json.dumps(r["slug"], ensure_ascii=False)},'
        + f'name_uk:{json.dumps(r["name_uk"], ensure_ascii=False)},'
        + f'mkey:{json.dumps(r["mkey"], ensure_ascii=False)},'
        + f'type:{json.dumps(r["type"])},'
        + f'oblast:{json.dumps(r["oblast"], ensure_ascii=False)},'
        + f'oblastSlug:{json.dumps(r["oblastSlug"])}'
        + "}"
        for r in rows
    )

    ts = f"""// AUTO-GENERATED by scripts/build_subregion_index.py — do not edit by hand.
export type SubRegionType = "raion" | "hromada";

export interface SubRegion {{
  slug: string;
  name_uk: string;
  mkey: string;
  type: SubRegionType;
  oblast: string;
  oblastSlug: string;
}}

export const SUBREGIONS: SubRegion[] = [
{body}
];

export const RAIONS = SUBREGIONS.filter((s) => s.type === "raion");
export const HROMADAS = SUBREGIONS.filter((s) => s.type === "hromada");

const bySlug = (type: SubRegionType) =>
  Object.fromEntries(
    SUBREGIONS.filter((s) => s.type === type).map((s) => [s.slug, s]),
  ) as Record<string, SubRegion>;

export const RAION_BY_SLUG = bySlug("raion");
export const HROMADA_BY_SLUG = bySlug("hromada");
"""
    OUT.write_text(ts)
    print(f"wrote {OUT.relative_to(REPO_ROOT)}: {len(raions)} raions + {len(hromadas)} hromadas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
