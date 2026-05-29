"""Build raions.geojson + hromadas.geojson from OpenStreetMap (Overpass).

Why OSM and not GADM: GADM 4.1 admin level 2 is the *pre-2020-reform* raions
(629 features) and carries no Ukrainian names (NL_NAME_2 = "NA"), so it cannot
be matched to alerts.in.ua, which reports against the post-reform raions /
hromadas with Ukrainian titles. OSM has both layers with `name:uk`:
  - admin_level=6  → raion        (≈161, e.g. "Криворізький район")
  - admin_level=7  → hromada      (≈1469, e.g. "Нікопольська міська громада")

Each output feature carries `mkey`, a normalized match key. The web client
normalizes alert titles the SAME way (see apps/web/src/lib/subregions.ts) and
colours a feature when an active alert's normalized title equals its `mkey`.

Requires: osm2geojson, shapely.
  python3 -m pip install --target=/tmp/geolibs osm2geojson shapely
  PYTHONPATH=/tmp/geolibs python3 scripts/build_subregions_geojson.py
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import osm2geojson  # type: ignore
from shapely import set_precision  # type: ignore
from shapely.geometry import mapping, shape  # type: ignore

OVERPASS = "https://overpass-api.de/api/interpreter"
USER_AGENT = "deshahed-geo-build/1.0 (contact: deshahed.online)"

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "apps" / "web" / "public" / "geo"

# admin_level → (output filename, location_type, simplify tolerance in degrees)
LAYERS = {
    6: ("raions.geojson", "raion", 0.003),
    7: ("hromadas.geojson", "hromada", 0.004),
}

# Hromada "type" tokens that alerts.in.ua collapses to "територіальна".
_TYPE_TOKENS = {"територіальна", "міська", "сільська", "селищна"}
_APOSTROPHE_RE = re.compile(r"[’ʼ`‘'´]")


def mkey(name: str) -> str:
    """Normalized match key — MUST stay in sync with lib/subregions.ts."""
    s = _APOSTROPHE_RE.sub("'", name.lower().strip())
    tokens = [t for t in s.split() if t not in _TYPE_TOKENS]
    return " ".join(tokens)


def fetch(level: int) -> dict:
    query = f"""
    [out:json][timeout:600];
    area["ISO3166-1"="UA"][admin_level=2]->.ua;
    relation(area.ua)["boundary"="administrative"]["admin_level"="{level}"];
    out geom;
    """
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(OVERPASS, data=data, headers={"User-Agent": USER_AGENT})
    print(f"  level {level}: querying Overpass…", file=sys.stderr)
    raw = urllib.request.urlopen(req, timeout=600).read()
    print(f"  level {level}: {len(raw):,} bytes", file=sys.stderr)
    return json.loads(raw)


def simplify(geom: dict, tol: float) -> dict | None:
    g = shape(geom)
    if not g.is_valid:
        g = g.buffer(0)
    g = g.simplify(tol, preserve_topology=True)
    g = set_precision(g, 0.0001)  # ~11 m grid; shrinks the encoded coordinates
    return None if g.is_empty else mapping(g)


def build(level: int) -> None:
    filename, location_type, tol = LAYERS[level]
    gj = osm2geojson.json2geojson(fetch(level))

    features: list[dict] = []
    seen: set[str] = set()
    for f in gj["features"]:
        tags = (f.get("properties") or {}).get("tags") or {}
        name = tags.get("name:uk") or tags.get("name")
        if not name:
            continue
        geom = simplify(f["geometry"], tol)
        if geom is None:
            continue
        key = mkey(name)
        if key in seen:
            continue  # collapse exact duplicate keys (rare)
        seen.add(key)
        features.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "name_uk": name,
                    "full_name_uk": name,
                    "location_type": location_type,
                    "mkey": key,
                    "state": "safe",
                },
            }
        )

    out = {
        "type": "FeatureCollection",
        "name": f"ukraine_{location_type}",
        "metadata": {
            "source": "OpenStreetMap via Overpass (© OSM contributors, ODbL)",
            "admin_level": level,
            "feature_count": len(features),
            "schema_version": 1,
        },
        "features": features,
    }
    path = OUT_DIR / filename
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    size_kb = path.stat().st_size / 1024
    print(f"  wrote {path.relative_to(REPO_ROOT)}: {len(features)} features, {size_kb:.0f} KB", file=sys.stderr)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for level in LAYERS:
        build(level)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
