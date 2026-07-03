"""Normalized match key for sub-oblast regions (raions / hromadas).

MUST stay byte-for-byte equivalent to `subKey()` in
apps/web/src/lib/subregions.ts and `mkey()` in
scripts/build_subregions_geojson.py: alerts.in.ua spells hromada types as
"...територіальна громада" while OSM uses the concrete type, so we drop the
type token from both and lowercase/normalize apostrophes to line the names up.
"""
from __future__ import annotations

_TYPE_TOKENS = frozenset({"територіальна", "міська", "сільська", "селищна"})

# Every apostrophe variant → a single straight quote, matching the JS
# character class /[’ʼ`‘'´]/.
_APOS = {ord(c): "'" for c in "’ʼ`‘'´"}


def subkey(title: str) -> str:
    normalized = title.lower().strip().translate(_APOS)
    return " ".join(t for t in normalized.split() if t not in _TYPE_TOKENS)
