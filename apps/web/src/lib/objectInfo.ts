// Reference data for air-threat object types shown in the hover popup and the
// detail modal. We get type + position + (sometimes) heading from OSINT; speed
// and altitude of a *specific* object are never in the feed, so we show the
// type's typical performance figures, clearly labelled "типові" (typical).

import type { DroneEventType } from "@/lib/types";

export interface ObjectTypeInfo {
  label: string; // short name shown as the object's "name"
  fullName: string; // expanded name for the modal header
  description: string;
  /** Typical cruise speed, km/h — null when not meaningful. */
  typicalSpeedKmh: [number, number] | number | null;
  /** Typical altitude, km. */
  typicalAltitudeKm: [number, number] | number | null;
  accent: string; // hex, matches the map icon colour
}

export const OBJECT_INFO: Record<DroneEventType, ObjectTypeInfo> = {
  shahed: {
    label: "Shahed / БпЛА",
    fullName: "Shahed-136 / Geran-2 (ударний БпЛА)",
    description:
      "Іранський ударний дрон-камікадзе з бойовою частиною ~40–50 кг. Летить низько за заданими координатами, характерний звук мопеда. Основна загроза по інфраструктурі та містах.",
    typicalSpeedKmh: [150, 180],
    typicalAltitudeKm: [1, 4],
    accent: "#fb923c",
  },
  recon: {
    label: "Розвідувальний БпЛА",
    fullName: "Розвідувальний дрон (Орлан, ZALA, Supercam тощо)",
    description:
      "Безпілотник для розвідки та коригування вогню — без бойової частини. Кружляє над територією, передає координати цілей. Поява часто передує артобстрілу або удару, тож слідкуйте за ситуацією.",
    typicalSpeedKmh: [90, 150],
    typicalAltitudeKm: [1, 5],
    accent: "#2dd4bf",
  },
  missile: {
    label: "Ракета",
    fullName: "Крилата / балістична ракета",
    description:
      "Ракетна загроза — крилаті (Х-101, «Калібр») або балістичні/аеробалістичні («Іскандер», «Кинджал»). Висока швидкість, мінімальний час підльоту. Негайно прямуйте в укриття.",
    typicalSpeedKmh: [700, 3500],
    typicalAltitudeKm: [0.05, 20],
    accent: "#dc2626",
  },
  kab: {
    label: "КАБ",
    fullName: "Керована авіабомба (КАБ/УМПК)",
    description:
      "Корегована авіабомба з модулем планування та корекції. Скидається тактичною авіацією за десятки кілометрів від цілі. Велика руйнівна сила, застосовується по прифронтових районах.",
    typicalSpeedKmh: [600, 900],
    typicalAltitudeKm: [2, 12],
    accent: "#a855f7",
  },
  aviation: {
    label: "Авіація",
    fullName: "Військова авіація",
    description:
      "Активність ворожої тактичної або стратегічної авіації. Може означати ризик пусків ракет або скидання КАБів. Слідкуйте за подальшими повідомленнями.",
    typicalSpeedKmh: [700, 1200],
    typicalAltitudeKm: [3, 11],
    accent: "#38bdf8",
  },
  unknown: {
    label: "Невідомий об'єкт",
    fullName: "Невідома повітряна ціль",
    description:
      "Тип цілі не визначено за наявними даними. Слідкуйте за оновленнями.",
    typicalSpeedKmh: null,
    typicalAltitudeKm: null,
    accent: "#9ca3af",
  },
};

export function objectInfo(type: string): ObjectTypeInfo {
  return OBJECT_INFO[(type as DroneEventType)] ?? OBJECT_INFO.unknown;
}

function fmtRange(v: [number, number] | number | null, unit: string): string {
  if (v === null) return "невідомо";
  if (Array.isArray(v)) return `~${v[0]}–${v[1]} ${unit}`;
  return `~${v} ${unit}`;
}

export function typicalSpeed(info: ObjectTypeInfo): string {
  return fmtRange(info.typicalSpeedKmh, "км/год");
}

export function typicalAltitude(info: ObjectTypeInfo): string {
  return fmtRange(info.typicalAltitudeKm, "км");
}

// Bearing (deg, 0=N clockwise) → 8-point Ukrainian compass with abbreviation.
const COMPASS: { abbr: string; name: string }[] = [
  { abbr: "Пн", name: "північ" },
  { abbr: "ПнСх", name: "північний схід" },
  { abbr: "Сх", name: "схід" },
  { abbr: "ПдСх", name: "південний схід" },
  { abbr: "Пд", name: "південь" },
  { abbr: "ПдЗх", name: "південний захід" },
  { abbr: "Зх", name: "захід" },
  { abbr: "ПнЗх", name: "північний захід" },
];

export function compass(bearingDeg: number): { abbr: string; name: string } {
  const i = Math.round(((bearingDeg % 360) / 45)) % 8;
  return COMPASS[i];
}
