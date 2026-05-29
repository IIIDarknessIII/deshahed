"""Derive apps/web/public/geo/oblast_labels.geojson from oblasts.geojson.

Why: MapLibre's `symbol-placement: point` labels every *part* of a MultiPolygon,
so oblasts with island/delta geometry (Kherson = 38 parts, Odesa/Zaporizhzhia/
Crimea = 9) render duplicate labels, and collision culling can drop a legitimate
one. We instead emit exactly one label anchor per oblast — the representative
point of its largest polygon part — and point the label layer at these points.

Requires: shapely.  PYTHONPATH=/tmp/geolibs python3 scripts/build_oblast_labels.py
"""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import mapping, shape  # type: ignore

REPO_ROOT = Path(__file__).resolve().parent.parent
GEO_DIR = REPO_ROOT / "apps" / "web" / "public" / "geo"
SRC = GEO_DIR / "oblasts.geojson"
OUT = GEO_DIR / "oblast_labels.geojson"


def label_point(geom: dict):
    g = shape(geom)
    if g.geom_type == "MultiPolygon":
        g = max(g.geoms, key=lambda p: p.area)  # mainland, not an island
    return g.representative_point()  # guaranteed inside the polygon


def main() -> int:
    src = json.loads(SRC.read_text())
    feats = []
    for f in src["features"]:
        p = f["properties"]
        if not p.get("name_uk"):
            continue
        feats.append(
            {
                "type": "Feature",
                "geometry": mapping(label_point(f["geometry"])),
                "properties": {
                    "name_uk": p["name_uk"],
                    "full_name_uk": p.get("full_name_uk", ""),
                },
            }
        )
    OUT.write_text(
        json.dumps(
            {"type": "FeatureCollection", "name": "ukraine_oblast_labels", "features": feats},
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
    print(f"wrote {OUT.relative_to(REPO_ROOT)}: {len(feats)} label points")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
