// Synthetic UID mapping that mirrors apps/api/app/dev/mock_alerts.py LOCATIONS.
// REPLACE THIS once the real alerts.in.ua location_uid values are populated
// into apps/web/public/geo/oblasts.geojson (see scripts/build_oblasts_geojson.py
// TODO about sync_alerts_locations.py).

export interface MockLocation {
  uid: number;
  title: string;
  type: "oblast" | "city" | "autonomous_republic";
}

export const LOCATIONS: MockLocation[] = [
  { uid: 1, title: "Вінницька область", type: "oblast" },
  { uid: 2, title: "Волинська область", type: "oblast" },
  { uid: 3, title: "Дніпропетровська область", type: "oblast" },
  { uid: 4, title: "Донецька область", type: "oblast" },
  { uid: 5, title: "Житомирська область", type: "oblast" },
  { uid: 6, title: "Закарпатська область", type: "oblast" },
  { uid: 7, title: "Запорізька область", type: "oblast" },
  { uid: 8, title: "Івано-Франківська область", type: "oblast" },
  { uid: 9, title: "Київська область", type: "oblast" },
  { uid: 10, title: "Кіровоградська область", type: "oblast" },
  { uid: 11, title: "Луганська область", type: "oblast" },
  { uid: 12, title: "Львівська область", type: "oblast" },
  { uid: 13, title: "Миколаївська область", type: "oblast" },
  { uid: 14, title: "Одеська область", type: "oblast" },
  { uid: 15, title: "Полтавська область", type: "oblast" },
  { uid: 16, title: "Рівненська область", type: "oblast" },
  { uid: 17, title: "Сумська область", type: "oblast" },
  { uid: 18, title: "Тернопільська область", type: "oblast" },
  { uid: 19, title: "Харківська область", type: "oblast" },
  { uid: 20, title: "Херсонська область", type: "oblast" },
  { uid: 21, title: "Хмельницька область", type: "oblast" },
  { uid: 22, title: "Черкаська область", type: "oblast" },
  { uid: 23, title: "Чернівецька область", type: "oblast" },
  { uid: 24, title: "Чернігівська область", type: "oblast" },
  { uid: 25, title: "м. Київ", type: "city" },
  { uid: 26, title: "м. Севастополь", type: "city" },
  { uid: 27, title: "Автономна Республіка Крим", type: "autonomous_republic" },
];

export const UID_BY_TITLE: Record<string, number> = Object.fromEntries(
  LOCATIONS.map((l) => [l.title, l.uid]),
);

export const TITLE_BY_UID: Record<number, string> = Object.fromEntries(
  LOCATIONS.map((l) => [l.uid, l.title]),
);
