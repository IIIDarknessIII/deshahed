"""One-off data prep: build apps/web/public/geo/oblasts.geojson from GADM 4.1.

Source: https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_UKR_1.json.zip
        (GADM admin level 1 boundaries for Ukraine — 27 oblasts + Crimea AR + Sevastopol + Kyiv city)

Output features have properties shaped to match the alerts.in.ua API model:
  - location_uid    : int | null    — to be filled after alerts.in.ua token arrives (see TODO)
  - location_type   : "oblast" | "city" | "autonomous_republic"
  - name_uk         : "Харківська"          (short form)
  - full_name_uk    : "Харківська область"  (matches alerts.in.ua `location_title`)
  - name_en         : "Kharkiv"
  - gid_1           : "UKR.8_1"             (provenance from GADM)

TODO: once ALERTS_API_TOKEN is provisioned, run scripts/sync_alerts_locations.py
to populate `location_uid` for every feature from /v1/locations.json.
"""
from __future__ import annotations

import io
import json
import sys
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

GADM_URL = "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_UKR_1.json.zip"

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "apps" / "web" / "public" / "geo" / "oblasts.geojson"

# L'viv has NL_NAME_1 = "NA" in GADM 4.1 — override.
NAME_UK_OVERRIDES: dict[str, str] = {
    "UKR.14_1": "Львівська",  # L'viv
}

# Kyiv city and Sevastopol city are non-oblast; Crimea is AR.
SPECIAL_TYPES: dict[str, tuple[str, str, str]] = {
    # gid_1: (location_type, name_uk, full_name_uk)
    "UKR.11_1": ("city", "Київ", "м. Київ"),
    "UKR.20_1": ("city", "Севастополь", "м. Севастополь"),
    "UKR.4_1": ("autonomous_republic", "Крим", "Автономна Республіка Крим"),
}


def strip_stress(s: str) -> str:
    """Remove combining acute accent (U+0301) used as stress mark — but keep precomposed
    letters like 'ї' / 'й' intact (NFD would split them and lose their diaeresis/breve)."""
    return unicodedata.normalize("NFC", s).replace("́", "")


def fetch_gadm() -> dict:
    print(f"downloading {GADM_URL}", file=sys.stderr)
    with urllib.request.urlopen(GADM_URL, timeout=60) as resp:
        data = resp.read()
    print(f"  {len(data):,} bytes (zip)", file=sys.stderr)
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".json"))
        with zf.open(name) as f:
            return json.load(f)


def transform_feature(feature: dict) -> dict | None:
    props = feature.get("properties") or {}
    gid_1 = props.get("GID_1")
    if not gid_1 or gid_1 == "?":
        return None

    name_en = props.get("NAME_1") or ""

    if gid_1 in SPECIAL_TYPES:
        location_type, name_uk, full_name_uk = SPECIAL_TYPES[gid_1]
    else:
        location_type = "oblast"
        raw_uk = NAME_UK_OVERRIDES.get(gid_1) or props.get("NL_NAME_1") or ""
        name_uk = strip_stress(raw_uk).strip()
        full_name_uk = f"{name_uk} область" if name_uk else ""

    return {
        "type": "Feature",
        "geometry": feature.get("geometry"),
        "properties": {
            "location_uid": None,
            "location_type": location_type,
            "name_uk": name_uk,
            "full_name_uk": full_name_uk,
            "name_en": name_en,
            "gid_1": gid_1,
        },
    }


def main() -> int:
    src = fetch_gadm()
    if src.get("type") != "FeatureCollection":
        print("ERROR: source is not a FeatureCollection", file=sys.stderr)
        return 1

    features: list[dict] = []
    for f in src.get("features", []):
        transformed = transform_feature(f)
        if transformed is not None:
            features.append(transformed)

    features.sort(key=lambda f: f["properties"]["gid_1"])

    out = {
        "type": "FeatureCollection",
        "name": "ukraine_admin_level_1",
        "metadata": {
            "source": "GADM 4.1 (https://gadm.org)",
            "source_url": GADM_URL,
            "feature_count": len(features),
            "schema_version": 1,
            "notes": "location_uid is null until populated from alerts.in.ua /v1/locations.json",
        },
        "features": features,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    size_kb = OUT_PATH.stat().st_size / 1024

    print(f"wrote {OUT_PATH.relative_to(REPO_ROOT)}: {len(features)} features, {size_kb:.1f} KB", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
