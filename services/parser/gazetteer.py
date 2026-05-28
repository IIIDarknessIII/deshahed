"""Toponym gazetteer for the local extractor.

Loaded once at worker startup from the `settlements` table (cities + towns)
plus oblast variants. For every canonical name we pre-expand all
morphological forms via pymorphy3 (`Київ` → києва, києву, києві, …;
`Київська область` → київської області, київську область, …) and stuff
them all into an Aho-Corasick automaton. The runtime search is therefore
a pure O(n+m) scan over the lowercased original message — no
per-message lemmatization, no per-token gazetteer probing.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable

import ahocorasick
import pymorphy3
from sqlalchemy import text

log = logging.getLogger("local_extractor.gazetteer")

# Canonical name → list of seed surface forms we want pymorphy3 to expand.
# Includes the "-щина" colloquials and the AR / city-of-Kyiv shortcuts.
OBLAST_SEEDS: dict[str, list[str]] = {
    "Вінницька область": ["Вінницька область", "Вінниччина"],
    "Волинська область": ["Волинська область", "Волинь"],
    "Дніпропетровська область": ["Дніпропетровська область", "Дніпропетровщина"],
    "Донецька область": ["Донецька область", "Донеччина"],
    "Житомирська область": ["Житомирська область", "Житомирщина"],
    "Закарпатська область": ["Закарпатська область", "Закарпаття"],
    "Запорізька область": ["Запорізька область", "Запоріжжя"],
    "Івано-Франківська область": [
        "Івано-Франківська область", "Івано-Франківщина", "Прикарпаття",
    ],
    "Київська область": ["Київська область", "Київщина"],
    "Кіровоградська область": ["Кіровоградська область", "Кіровоградщина"],
    "Луганська область": ["Луганська область", "Луганщина"],
    "Львівська область": ["Львівська область", "Львівщина"],
    "Миколаївська область": ["Миколаївська область", "Миколаївщина"],
    "Одеська область": ["Одеська область", "Одещина"],
    "Полтавська область": ["Полтавська область", "Полтавщина"],
    "Рівненська область": ["Рівненська область", "Рівненщина"],
    "Сумська область": ["Сумська область", "Сумщина"],
    "Тернопільська область": ["Тернопільська область", "Тернопільщина"],
    "Харківська область": ["Харківська область", "Харківщина"],
    "Херсонська область": ["Херсонська область", "Херсонщина"],
    "Хмельницька область": ["Хмельницька область", "Хмельниччина"],
    "Черкаська область": ["Черкаська область", "Черкащина"],
    "Чернівецька область": ["Чернівецька область", "Буковина"],
    "Чернігівська область": ["Чернігівська область", "Чернігівщина"],
    # City-of-Kyiv / Sevastopol: map to settlement-friendly canonicals so the
    # downstream L1 geocoder can match "Київ" in the settlements table.
    "Київ": ["Київ"],
    "Севастополь": ["Севастополь"],
    "Автономна Республіка Крим": ["Крим"],
}


@dataclass(frozen=True)
class Hit:
    canonical: str  # canonical name fed to the geocoder
    start: int      # char offset in the lowercased haystack
    end: int        # exclusive


# Unify apostrophe variants so "Куп'янськ", "Куп'янськ" and "Купʼянськ"
# all collapse to the same key.
_APOSTROPHES = "'’ʼʻʽ`"
_APOSTROPHE_TRANSLATE = str.maketrans({c: "'" for c in _APOSTROPHES})


def normalize_search(s: str) -> str:
    """The exact transform applied to both gazetteer keys and message text
    before AC search. Must stay symmetric — anything that changes the
    char count or alignment will break hit→token mapping."""
    s = s.lower().translate(_APOSTROPHE_TRANSLATE)
    return s


_CASES = ("nomn", "gent", "datv", "accs", "ablt", "loct")
_NUMBERS = ("sing", "plur")


def _expand_word(morph: pymorphy3.MorphAnalyzer, w: str) -> set[str]:
    """Every surface form of a single word — union over all parse
    alternatives × every (case, number) inflection. Pymorphy3 often
    misinterprets plural-tantum city names (Суми → "сума" singular);
    asking for plur explicitly fixes that without hardcoded overrides."""
    out: set[str] = {w, w.lower()}
    for p in morph.parse(w):
        for f in p.lexeme:
            out.add(f.word)
        for case in _CASES:
            for number in _NUMBERS:
                infl = p.inflect({case, number})
                if infl is not None:
                    out.add(infl.word)
    return out


def _expand_forms(morph: pymorphy3.MorphAnalyzer, name: str) -> set[str]:
    """Cross-product of per-word surface forms for multi-word toponyms
    (Київська + область). Coverage is broad enough for the typical
    Ukrainian case-marked phrases in TG text."""
    words = name.split()
    if not words:
        return set()
    if len(words) == 1:
        return _expand_word(morph, words[0])

    # For multi-word, inflect each word in lockstep across the common
    # (case, number) tags. Falling back to case-only when number-specific
    # inflection isn't available keeps coverage for words pymorphy doesn't
    # have plural data for.
    out: set[str] = {name}
    for case in _CASES:
        for number in _NUMBERS:
            forms: list[str] = []
            for w in words:
                parses = morph.parse(w)
                if not parses:
                    forms = []
                    break
                infl = parses[0].inflect({case, number}) or parses[0].inflect({case})
                if infl is None:
                    forms = []
                    break
                forms.append(infl.word)
            if forms and len(forms) == len(words):
                out.add(" ".join(forms))
    return out


class Gazetteer:
    def __init__(self, automaton: "ahocorasick.Automaton") -> None:
        self._automaton = automaton

    def find(self, haystack: str) -> list[Hit]:
        """All non-overlapping hits, longest-first; haystack must already be
        normalize_search()'d by the caller."""
        raw: list[Hit] = []
        for end_idx, (length, canonical) in self._automaton.iter(haystack):
            start_idx = end_idx - length + 1
            raw.append(Hit(canonical=canonical, start=start_idx, end=end_idx + 1))

        raw.sort(key=lambda x: (-(x.end - x.start), x.start))
        chosen: list[Hit] = []
        taken: list[tuple[int, int]] = []
        for hit in raw:
            if any(not (hit.end <= a or hit.start >= b) for a, b in taken):
                continue
            chosen.append(hit)
            taken.append((hit.start, hit.end))
        chosen.sort(key=lambda x: x.start)
        return chosen


async def load_gazetteer(session, morph: pymorphy3.MorphAnalyzer) -> Gazetteer:
    a = ahocorasick.Automaton()
    added = 0
    duplicates = 0

    def add(canonical: str, forms: Iterable[str]) -> None:
        nonlocal added, duplicates
        for f in forms:
            key = normalize_search(f)
            if not key or len(key) < 3:
                continue
            if a.exists(key):
                duplicates += 1
                continue
            a.add_word(key, (len(key), canonical))
            added += 1

    # Cities & towns from the settlements table (~999 names), expand each.
    rows = (
        await session.execute(
            text(
                """
                SELECT name, type
                FROM settlements
                WHERE type IN ('city', 'town')
                ORDER BY (type = 'city') DESC, name
                """
            )
        )
    ).all()
    for r in rows:
        add(r.name, _expand_forms(morph, r.name))

    # Oblasts + special regions, each with its seed variants expanded.
    for canonical, seeds in OBLAST_SEEDS.items():
        for seed in seeds:
            add(canonical, _expand_forms(morph, seed))

    a.make_automaton()
    log.info("gazetteer ready: %d unique keys (%d duplicate forms collapsed)", added, duplicates)
    return Gazetteer(a)
