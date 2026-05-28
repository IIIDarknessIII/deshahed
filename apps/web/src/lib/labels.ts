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
