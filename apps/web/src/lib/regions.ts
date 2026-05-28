// Slug → human-readable region info for /region/[slug] pages.
// Keep aligned with services/parser side's settlements oblast names.

export interface RegionInfo {
  slug: string;
  uid: number;            // synthetic mock UID (replace with alerts.in.ua UID once provisioned)
  title: string;          // Ukrainian title used for SEO + UI
  title_en: string;       // English title used for Open Graph alt etc.
  full_name_uk: string;   // canonical full form ("Харківська область")
  type: "oblast" | "city" | "autonomous_republic";
}

export const REGIONS: RegionInfo[] = [
  { slug: "vinnytsia", uid: 1, title: "Вінниччина", title_en: "Vinnytsia Oblast", full_name_uk: "Вінницька область", type: "oblast" },
  { slug: "volyn", uid: 2, title: "Волинь", title_en: "Volyn Oblast", full_name_uk: "Волинська область", type: "oblast" },
  { slug: "dnipropetrovsk", uid: 3, title: "Дніпропетровщина", title_en: "Dnipropetrovsk Oblast", full_name_uk: "Дніпропетровська область", type: "oblast" },
  { slug: "donetsk", uid: 4, title: "Донеччина", title_en: "Donetsk Oblast", full_name_uk: "Донецька область", type: "oblast" },
  { slug: "zhytomyr", uid: 5, title: "Житомирщина", title_en: "Zhytomyr Oblast", full_name_uk: "Житомирська область", type: "oblast" },
  { slug: "zakarpattia", uid: 6, title: "Закарпаття", title_en: "Zakarpattia Oblast", full_name_uk: "Закарпатська область", type: "oblast" },
  { slug: "zaporizhzhia", uid: 7, title: "Запоріжжя", title_en: "Zaporizhzhia Oblast", full_name_uk: "Запорізька область", type: "oblast" },
  { slug: "ivano-frankivsk", uid: 8, title: "Прикарпаття", title_en: "Ivano-Frankivsk Oblast", full_name_uk: "Івано-Франківська область", type: "oblast" },
  { slug: "kyiv-oblast", uid: 9, title: "Київщина", title_en: "Kyiv Oblast", full_name_uk: "Київська область", type: "oblast" },
  { slug: "kirovohrad", uid: 10, title: "Кіровоградщина", title_en: "Kirovohrad Oblast", full_name_uk: "Кіровоградська область", type: "oblast" },
  { slug: "luhansk", uid: 11, title: "Луганщина", title_en: "Luhansk Oblast", full_name_uk: "Луганська область", type: "oblast" },
  { slug: "lviv", uid: 12, title: "Львівщина", title_en: "Lviv Oblast", full_name_uk: "Львівська область", type: "oblast" },
  { slug: "mykolaiv", uid: 13, title: "Миколаївщина", title_en: "Mykolaiv Oblast", full_name_uk: "Миколаївська область", type: "oblast" },
  { slug: "odesa", uid: 14, title: "Одещина", title_en: "Odesa Oblast", full_name_uk: "Одеська область", type: "oblast" },
  { slug: "poltava", uid: 15, title: "Полтавщина", title_en: "Poltava Oblast", full_name_uk: "Полтавська область", type: "oblast" },
  { slug: "rivne", uid: 16, title: "Рівненщина", title_en: "Rivne Oblast", full_name_uk: "Рівненська область", type: "oblast" },
  { slug: "sumy", uid: 17, title: "Сумщина", title_en: "Sumy Oblast", full_name_uk: "Сумська область", type: "oblast" },
  { slug: "ternopil", uid: 18, title: "Тернопільщина", title_en: "Ternopil Oblast", full_name_uk: "Тернопільська область", type: "oblast" },
  { slug: "kharkiv", uid: 19, title: "Харківщина", title_en: "Kharkiv Oblast", full_name_uk: "Харківська область", type: "oblast" },
  { slug: "kherson", uid: 20, title: "Херсонщина", title_en: "Kherson Oblast", full_name_uk: "Херсонська область", type: "oblast" },
  { slug: "khmelnytskyi", uid: 21, title: "Хмельниччина", title_en: "Khmelnytskyi Oblast", full_name_uk: "Хмельницька область", type: "oblast" },
  { slug: "cherkasy", uid: 22, title: "Черкащина", title_en: "Cherkasy Oblast", full_name_uk: "Черкаська область", type: "oblast" },
  { slug: "chernivtsi", uid: 23, title: "Буковина", title_en: "Chernivtsi Oblast", full_name_uk: "Чернівецька область", type: "oblast" },
  { slug: "chernihiv", uid: 24, title: "Чернігівщина", title_en: "Chernihiv Oblast", full_name_uk: "Чернігівська область", type: "oblast" },
  { slug: "kyiv", uid: 25, title: "Київ", title_en: "Kyiv", full_name_uk: "м. Київ", type: "city" },
  { slug: "sevastopol", uid: 26, title: "Севастополь", title_en: "Sevastopol", full_name_uk: "м. Севастополь", type: "city" },
  { slug: "krym", uid: 27, title: "Крим", title_en: "Crimea", full_name_uk: "Автономна Республіка Крим", type: "autonomous_republic" },
];

export const REGION_BY_SLUG: Record<string, RegionInfo> = Object.fromEntries(
  REGIONS.map((r) => [r.slug, r]),
);
