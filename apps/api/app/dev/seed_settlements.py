"""One-off populator for the `settlements` table from the GeoNames UA dump.

Source: https://download.geonames.org/export/dump/UA.zip
TSV columns of UA.txt (1-indexed, per GeoNames readme):
  1  geonameid     5  latitude        9  country_code   13 admin3_code
  2  name          6  longitude       10 cc2            14 admin4_code
  3  asciiname     7  feature_class   11 admin1_code    15 population
  4  alternatenames 8 feature_code    12 admin2_code    ...

We keep only feature_class = "P" (populated place). For each row we:
  - pick the best Ukrainian-looking name (cyrillic, prefers ones with і/ї/є/ґ)
  - normalize to lowercase, strip apostrophes/dashes/dots for fuzzy match
  - resolve admin1_code → oblast title via ADMIN1
  - bucket population into city/town/village for the `type` column

Run inside the api container:
    docker compose -f infra/docker-compose.yml --env-file .env \
        exec -T api python -m app.dev.seed_settlements
"""
from __future__ import annotations

import asyncio
import io
import logging
import re
import sys
import urllib.request
import zipfile
from typing import Iterable

from sqlalchemy import delete, insert

from app.db import dispose, get_session_factory
from app.models import Settlement

log = logging.getLogger("seed_settlements")

GEONAMES_URL = "https://download.geonames.org/export/dump/UA.zip"

# Some PPLA/PPLC rows in the GeoNames basic dump lack:
#   (a) an admin1_code (because the city IS the admin1 — Kyiv, Sevastopol),
#   (b) a Cyrillic alternateName (the basic dump trims them aggressively).
# Inject these by geonameid so we don't lose every oblast capital + Kyiv.
GEONAME_OVERRIDES: dict[int, dict] = {
    703448: dict(name="Київ", oblast="м. Київ", type="city"),
    694423: dict(name="Севастополь", oblast="м. Севастополь", type="city"),
    706483: dict(name="Харків", oblast="Харківська область", type="city"),
    702550: dict(name="Львів", oblast="Львівська область", type="city"),
    698740: dict(name="Одеса", oblast="Одеська область", type="city"),
    709930: dict(name="Дніпро", oblast="Дніпропетровська область", type="city"),
    709717: dict(name="Донецьк", oblast="Донецька область", type="city"),
    687700: dict(name="Запоріжжя", oblast="Запорізька область", type="city"),
    706482: dict(name="Кривий Ріг", oblast="Дніпропетровська область", type="city"),
    702658: dict(name="Луганськ", oblast="Луганська область", type="city"),
    700569: dict(name="Миколаїв", oblast="Миколаївська область", type="city"),
    696643: dict(name="Полтава", oblast="Полтавська область", type="city"),
    707471: dict(name="Івано-Франківськ", oblast="Івано-Франківська область", type="city"),
    686967: dict(name="Житомир", oblast="Житомирська область", type="city"),
    692194: dict(name="Суми", oblast="Сумська область", type="city"),
    690548: dict(name="Ужгород", oblast="Закарпатська область", type="city"),
    691650: dict(name="Тернопіль", oblast="Тернопільська область", type="city"),
    689558: dict(name="Вінниця", oblast="Вінницька область", type="city"),
    706369: dict(name="Хмельницький", oblast="Хмельницька область", type="city"),
    705812: dict(name="Кропивницький", oblast="Кіровоградська область", type="city"),
    706448: dict(name="Херсон", oblast="Херсонська область", type="city"),
    695594: dict(name="Рівне", oblast="Рівненська область", type="city"),
    702569: dict(name="Луцьк", oblast="Волинська область", type="city"),
    710719: dict(name="Чернівці", oblast="Чернівецька область", type="city"),
    710735: dict(name="Чернігів", oblast="Чернігівська область", type="city"),
    710791: dict(name="Черкаси", oblast="Черкаська область", type="city"),
    703446: dict(name="Сімферополь", oblast="Автономна Республіка Крим", type="city"),
}

# UA admin1_code → oblast/city/AR title matching what alerts.in.ua reports.
ADMIN1: dict[str, str] = {
    "01": "Черкаська область",
    "02": "Чернігівська область",
    "03": "Чернівецька область",
    "04": "Дніпропетровська область",
    "05": "Донецька область",
    "06": "Івано-Франківська область",
    "07": "Харківська область",
    "08": "Херсонська область",
    "09": "Хмельницька область",
    "10": "Кіровоградська область",
    "11": "Автономна Республіка Крим",
    "12": "м. Київ",
    "13": "Київська область",
    "14": "Луганська область",
    "15": "Львівська область",
    "16": "Миколаївська область",
    "17": "Одеська область",
    "18": "Полтавська область",
    "19": "Рівненська область",
    "20": "м. Севастополь",
    "21": "Сумська область",
    "22": "Тернопільська область",
    "23": "Вінницька область",
    "24": "Волинська область",
    "25": "Закарпатська область",
    "26": "Запорізька область",
    "27": "Житомирська область",
}

CYRILLIC_RE = re.compile(r"[А-Яа-яІіЇїЄєҐґ]")
UA_DISTINCTIVE_RE = re.compile(r"[ІіЇїЄєҐґ]")

# Strip apostrophe variants, dashes, dots, multiple spaces.
NORMALIZE_STRIP_RE = re.compile(r"['’ʼʻʽ'`\-\.]+")
NORMALIZE_WS_RE = re.compile(r"\s+")


def normalize(name: str) -> str:
    n = name.lower()
    n = NORMALIZE_STRIP_RE.sub("", n)
    n = NORMALIZE_WS_RE.sub(" ", n).strip()
    return n


def pick_uk_name(name: str, alternates_csv: str) -> str | None:
    candidates: list[str] = []
    if name and CYRILLIC_RE.search(name):
        candidates.append(name)
    for alt in alternates_csv.split(","):
        alt = alt.strip()
        if alt and CYRILLIC_RE.search(alt) and len(alt) <= 80:
            candidates.append(alt)

    if not candidates:
        return None

    # Prefer names with Ukrainian-distinctive letters first.
    distinctive = [c for c in candidates if UA_DISTINCTIVE_RE.search(c)]
    if distinctive:
        return distinctive[0]
    return candidates[0]


def bucket_type(population_str: str) -> str | None:
    try:
        pop = int(population_str) if population_str else 0
    except ValueError:
        pop = 0
    if pop >= 50_000:
        return "city"
    if pop >= 5_000:
        return "town"
    return "village"


def parse_rows(text_stream: Iterable[bytes]) -> list[dict]:
    out: list[dict] = []
    for raw in text_stream:
        line = raw.decode("utf-8")
        cols = line.rstrip("\n").split("\t")
        if len(cols) < 15:
            continue
        if cols[6] != "P":  # feature_class
            continue

        try:
            geonameid = int(cols[0])
        except ValueError:
            continue

        override = GEONAME_OVERRIDES.get(geonameid)
        if override is not None:
            name_uk = override["name"]
            oblast = override["oblast"]
            type_override = override["type"]
        else:
            oblast = ADMIN1.get(cols[10])
            if not oblast:
                continue
            name_uk = pick_uk_name(cols[1], cols[3])
            if not name_uk:
                continue
            type_override = None

        try:
            lat = float(cols[4])
            lon = float(cols[5])
        except ValueError:
            continue

        out.append(
            {
                "name": name_uk,
                "name_normalized": normalize(name_uk),
                "oblast": oblast,
                "raion": None,
                "lat": lat,
                "lon": lon,
                "type": type_override or bucket_type(cols[14]),
            }
        )
    return out


async def amain() -> int:
    try:
        log.info("downloading %s", GEONAMES_URL)
        with urllib.request.urlopen(GEONAMES_URL, timeout=120) as resp:
            data = resp.read()
        log.info("  %.1f MB", len(data) / 1024 / 1024)

        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            with zf.open("UA.txt") as f:
                rows = parse_rows(f.readlines())
        log.info("parsed %d settlement rows", len(rows))

        factory = get_session_factory()
        async with factory() as session:
            # Idempotent: wipe and re-seed.
            await session.execute(delete(Settlement))
            BATCH = 1000
            for i in range(0, len(rows), BATCH):
                await session.execute(insert(Settlement), rows[i : i + BATCH])
            await session.commit()

        log.info("seeded %d rows into settlements", len(rows))
        return 0
    finally:
        await dispose()


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s [%(levelname)s] %(message)s",
    )
    return asyncio.run(amain())


if __name__ == "__main__":
    sys.exit(main())
