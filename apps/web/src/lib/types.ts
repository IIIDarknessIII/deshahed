export type AlertType =
  | "air_raid"
  | "artillery_shelling"
  | "urban_fights"
  | "chemical"
  | "nuclear"
  | "unknown";

export type LocationType =
  | "oblast"
  | "raion"
  | "hromada"
  | "city"
  | "autonomous_republic";

export interface AlertView {
  location_uid: number;
  location_title: string;
  location_type: LocationType;
  alert_type: AlertType;
  started_at: string;
  finished_at: string | null;
}

export type WsMessage =
  | { type: "snapshot"; alerts: AlertView[] }
  | { type: "alert_started"; alert: AlertView }
  | { type: "alert_ended"; location_uid: number; alert_type: AlertType };
