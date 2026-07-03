// Human-readable Ukrainian labels for alerts.in.ua's raw `alert_type` codes.
// Used everywhere we render an alert to the user (panels, popups, badges).

import type { AlertType } from "@/lib/types";

export const ALERT_TYPE_LABEL_UK: Record<AlertType, string> = {
  air_raid: "Повітряна тривога",
  artillery_shelling: "Загроза артилерійського обстрілу",
  urban_fights: "Загроза вуличних боїв",
  chemical: "Загроза хімічного зараження",
  nuclear: "Загроза радіаційного зараження",
  unknown: "Невідомий тип загрози",
};

export function alertTypeLabel(t: AlertType | string): string {
  return ALERT_TYPE_LABEL_UK[t as AlertType] ?? "Невідомий тип загрози";
}

/**
 * Semantic accent per alert type — a single source shared by the alerts panel,
 * legend and (eventually) the map paint. Values are design-token keys.
 */
export type AlertAccent = "alert" | "artillery" | "street" | "warn" | "muted";

export const ALERT_TYPE_ACCENT: Record<AlertType, AlertAccent> = {
  air_raid: "alert",
  artillery_shelling: "artillery",
  urban_fights: "street",
  chemical: "warn",
  nuclear: "warn",
  unknown: "muted",
};

export function alertTypeAccent(t: AlertType | string): AlertAccent {
  return ALERT_TYPE_ACCENT[t as AlertType] ?? "muted";
}
