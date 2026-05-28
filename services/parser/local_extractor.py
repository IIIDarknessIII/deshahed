"""Local first-pass extractor — lemmatize the message for type detection and
search a pre-expanded gazetteer for toponyms, producing structured events
without hitting an LLM.

Cascade-tier 1 — handles the long tail of straightforward OSINT phrases:
  • "Шахед курсом з Полтави на Харків"   → shahed @ Полтава → Харків, high
  • "Дві ракети у Київській області"     → missile @ Київська область, count=2
  • "1 КАБ скинуто на Куп'янськ"          → kab @ Куп'янськ, count=1
  • "Тихо"                                → empty events, high confidence

Ambiguous / multi-event messages return `confident=False`, falling through
to the free-tier LLM in the caller.
"""
from __future__ import annotations

import logging
import re
from bisect import bisect_right
from dataclasses import dataclass, field

import pymorphy3

from app.schemas.drones import ConfidenceLevel, DroneEventType, LLMEvent, LLMResponse
from .gazetteer import Gazetteer, Hit, normalize_search

log = logging.getLogger("local_extractor")

# Event-type detection — prefix-match on the lowercased token so we catch
# every case form (шахед / шахеда / шахедів / шахедам …) without relying
# on pymorphy3 knowing the loanword. Stems are chosen to be unambiguous.
TYPE_STEMS: dict[DroneEventType, set[str]] = {
    "shahed": {"шахед", "shahed", "герань", "geran"},
    "missile": {
        "ракет", "крилат", "балістик", "калібр", "kalibr",
        "кинджал", "іскандер", "онікс",
    },
    "kab": {"каб", "fab", "фаб"},
    "aviation": {"авіаці", "винищувач", "бомбардувальник", "стратегічн"},
}

# Exact-lemma matches for shorter ambiguous tokens — applied after stems.
TYPE_LEMMAS: dict[DroneEventType, set[str]] = {
    "shahed": {"дрон", "безпілотник", "бпла"},
    "missile": set(),
    "kab": {"керований"},
    "aviation": set(),
}

TYPE_RAW_PATTERNS: dict[DroneEventType, list[re.Pattern[str]]] = {
    "missile": [re.compile(r"\b[хx][- ]?(101|22|32|55|59|69)\b", re.IGNORECASE)],
    "kab": [re.compile(r"\bкаб[- ]?\d*\b", re.IGNORECASE), re.compile(r"\bкаби\b", re.IGNORECASE)],
    "aviation": [re.compile(r"\b(су|ту|міг)[- ]?\d{2,3}\b", re.IGNORECASE)],
    "shahed": [re.compile(r"\bshahed[- ]?\d*\b", re.IGNORECASE)],
}

COUNT_WORDS: dict[str, int] = {
    "один": 1, "два": 2, "три": 3, "чотири": 4, "пять": 5,
    "п'ять": 5, "шість": 6, "сім": 7, "вісім": 8, "девять": 9,
    "дев'ять": 9, "десять": 10,
}

# Multi-token markers only — bare prepositions ("на", "у", "в") are too
# ambiguous in Ukrainian (locative vs accusative direction). The downstream
# LLM tier is fine for messages that lack an explicit direction phrase.
DIRECTION_MARKERS: list[tuple[str, ...]] = [
    ("курсом", "на"),
    ("курс", "на"),
    ("рух", "на"),
    ("рух", "у"),
    ("рухатися", "на"),
    ("в", "напрямок"),
    ("у", "напрямок"),
    ("прямувати", "на"),
    ("летіти", "на"),
    ("йти", "на"),
    ("піти", "на"),
]

ORIGIN_PREPOSITIONS: set[str] = {"з", "із", "зі"}


@dataclass
class LocalExtraction:
    events: list[LLMEvent] = field(default_factory=list)
    confident: bool = False
    reason: str = ""


@dataclass
class _Token:
    lemma: str
    lower: str
    start: int
    end: int


_WORD_RE = re.compile(r"[А-ЯЇЄҐІа-яїєґіA-Za-z0-9'’ʼ\-]+")


class LocalExtractor:
    def __init__(self, gazetteer: Gazetteer, morph: pymorphy3.MorphAnalyzer) -> None:
        self._gaz = gazetteer
        self._morph = morph

    def extract(self, text_in: str) -> LocalExtraction:
        text_in = text_in or ""
        haystack = normalize_search(text_in)
        tokens = self._tokenize(text_in, haystack)
        if not tokens:
            return LocalExtraction(events=[], confident=True, reason="empty")

        # Type detection: prefix-stem first, then exact lemma fallback.
        type_hits: list[tuple[DroneEventType, int]] = []
        for i, tok in enumerate(tokens):
            matched: DroneEventType | None = None
            for typ, stems in TYPE_STEMS.items():
                if any(tok.lower.startswith(s) for s in stems):
                    matched = typ
                    break
            if matched is None:
                for typ, lemmas in TYPE_LEMMAS.items():
                    if tok.lemma in lemmas or tok.lower in lemmas:
                        matched = typ
                        break
            if matched is not None:
                type_hits.append((matched, i))

        for typ, patterns in TYPE_RAW_PATTERNS.items():
            for pat in patterns:
                for m in pat.finditer(haystack):
                    s = m.start()
                    for i, tok in enumerate(tokens):
                        if tok.start <= s < tok.end:
                            if not any(h == (typ, i) for h in type_hits):
                                type_hits.append((typ, i))
                            break

        # Toponym detection. AC matches substrings, so we filter to hits that
        # align cleanly to token boundaries — kills false positives like
        # "Білорусі" → "Біле" (the latter being a village stem inside the
        # country name).
        token_bounds: set[tuple[int, int]] = set()
        # Precompute every (start, end) span that covers one or more whole
        # consecutive tokens — those are the only spans a real toponym can
        # occupy in our normalized text.
        for i in range(len(tokens)):
            for j in range(i, len(tokens)):
                token_bounds.add((tokens[i].start, tokens[j].end))
        raw_hits = self._gaz.find(haystack)
        hits = [h for h in raw_hits if (h.start, h.end) in token_bounds]

        if not type_hits:
            return LocalExtraction(
                events=[], confident=True,
                reason="toponym-only" if hits else "no-keywords",
            )

        unique_types = sorted({t for t, _ in type_hits})
        if len(unique_types) != 1:
            return LocalExtraction(confident=False, reason="multi-type")
        event_type = unique_types[0]

        if not hits:
            return LocalExtraction(confident=False, reason="type-without-toponym")

        if len(hits) == 1:
            # If the only toponym is preceded by a direction marker, it's the
            # *destination*, and we don't know the origin — punt to LLM.
            sole_idx = self._token_at(tokens, hits[0].start)
            if self._direction_marker_before(tokens, sole_idx):
                return LocalExtraction(confident=False, reason="direction-only-no-origin")
            return self._build_single(event_type, hits[0], tokens, type_hits)
        if len(hits) == 2:
            return self._build_pair(event_type, hits, tokens, type_hits)
        return LocalExtraction(confident=False, reason="too-many-toponyms")

    # ---------- internals ----------

    def _tokenize(self, text_in: str, haystack: str) -> list[_Token]:
        out: list[_Token] = []
        for m in _WORD_RE.finditer(text_in):
            w = m.group(0)
            lemma = self._morph.parse(w)[0].normal_form
            out.append(
                _Token(lemma=lemma, lower=w.lower(), start=m.start(), end=m.end())
            )
        return out

    def _token_at(self, tokens: list[_Token], char_pos: int) -> int:
        # tokens are in increasing start order — binary search by start
        starts = [t.start for t in tokens]
        idx = bisect_right(starts, char_pos) - 1
        if idx < 0:
            idx = 0
        # If the hit starts before this token ends — keep it; otherwise advance.
        if idx + 1 < len(tokens) and tokens[idx].end <= char_pos:
            idx += 1
        return min(idx, len(tokens) - 1)

    def _detect_count(self, tokens: list[_Token], type_token_idx: int) -> int:
        for offset in (1, 2):
            j = type_token_idx - offset
            if j < 0:
                break
            tok = tokens[j]
            if tok.lemma in COUNT_WORDS:
                return COUNT_WORDS[tok.lemma]
            if tok.lower.isdigit():
                try:
                    n = int(tok.lower)
                    if 1 <= n <= 100:
                        return n
                except ValueError:
                    pass
        return 1

    def _direction_marker_before(
        self, tokens: list[_Token], hit_token_idx: int
    ) -> bool:
        if hit_token_idx <= 0:
            return False
        for marker in DIRECTION_MARKERS:
            n = len(marker)
            if hit_token_idx - n < 0:
                continue
            window = tuple(
                tokens[hit_token_idx - k - 1].lemma for k in reversed(range(n))
            )
            if window == marker:
                return True
        return False

    def _origin_marker_before(
        self, tokens: list[_Token], hit_token_idx: int
    ) -> bool:
        if hit_token_idx <= 0:
            return False
        return tokens[hit_token_idx - 1].lemma in ORIGIN_PREPOSITIONS

    def _build_single(
        self,
        event_type: DroneEventType,
        hit: Hit,
        tokens: list[_Token],
        type_hits: list[tuple[DroneEventType, int]],
    ) -> LocalExtraction:
        type_tok = type_hits[0][1]
        event = LLMEvent(
            type=event_type,
            location=hit.canonical,
            direction=None,
            count=self._detect_count(tokens, type_tok),
            confidence="high",
        )
        return LocalExtraction(events=[event], confident=True, reason="single")

    def _build_pair(
        self,
        event_type: DroneEventType,
        hits: list[Hit],
        tokens: list[_Token],
        type_hits: list[tuple[DroneEventType, int]],
    ) -> LocalExtraction:
        h1, h2 = hits[0], hits[1]
        i1 = self._token_at(tokens, h1.start)
        i2 = self._token_at(tokens, h2.start)
        type_tok = type_hits[0][1]

        # The "з X ... Y" / "із X ... на Y" / "з X курсом на Y" family is
        # unambiguous: origin → destination. We don't require an explicit
        # direction marker right before Y once we've seen the origin marker.
        if self._origin_marker_before(tokens, i1):
            event = LLMEvent(
                type=event_type, location=h1.canonical, direction=h2.canonical,
                count=self._detect_count(tokens, type_tok), confidence="high",
            )
            return LocalExtraction(events=[event], confident=True, reason="origin+direction")

        if self._direction_marker_before(tokens, i2):
            event = LLMEvent(
                type=event_type, location=h1.canonical, direction=h2.canonical,
                count=self._detect_count(tokens, type_tok), confidence="medium",
            )
            return LocalExtraction(events=[event], confident=True, reason="direction-marker")

        return LocalExtraction(confident=False, reason="pair-ambiguous")
