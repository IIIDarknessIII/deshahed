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
  /** Parent oblast — for hromada / raion / city alerts, the oblast that contains them.
   *  For oblast-level alerts mirrors location_title. */
  location_oblast: string;
  location_oblast_uid: number;
}

export type WsMessage =
  | { type: "snapshot"; alerts: AlertView[] }
  | { type: "alert_started"; alert: AlertView }
  | { type: "alert_ended"; location_uid: number; alert_type: AlertType };

export type DroneEventType =
  | "shahed"
  | "missile"
  | "kab"
  | "aviation"
  | "unknown";

export interface DroneEvent {
  id: number;
  event_type: DroneEventType;
  location_text: string;
  direction_text: string | null;
  location_lat: number;
  location_lon: number;
  direction_lat: number | null;
  direction_lon: number | null;
  confidence: "high" | "medium" | "low";
  source_channel: string;
  detected_at: string;
  expires_at: string;
}

export type DroneWsMessage =
  | { type: "drone_snapshot"; drones: DroneEvent[] }
  | { type: "drone_appeared"; drone: DroneEvent };

export interface DroneTrack {
  id: string;
  event_type: DroneEventType;
  first_seen_at: string;
  last_seen_at: string;
  point_count: number;
  is_active: boolean;
  confidence: "high" | "medium" | "low" | null;
  /** GeoJSON LineString; null while point_count === 1. */
  path: { type: "LineString"; coordinates: [number, number][] } | null;
  last_lat: number;
  last_lon: number;
}

export type TrackWsMessage =
  | { type: "track_snapshot"; tracks: DroneTrack[] }
  | { type: "track_updated"; track: DroneTrack };
