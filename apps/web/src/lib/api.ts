import { ENV } from "@/lib/env";
import type { AlertView } from "@/lib/types";

export type Period = "day" | "week" | "month" | "all";

export interface OblastStat {
  location_uid: number;
  location_title: string;
  count: number;
  duration_minutes: number;
}

export interface SummaryResponse {
  period: Period;
  total_alerts: number;
  total_duration_minutes: number;
  by_oblast: OblastStat[];
}

export interface HistoryItem {
  id: number;
  location_uid: number;
  location_title: string;
  location_type: AlertView["location_type"];
  alert_type: AlertView["alert_type"];
  started_at: string;
  finished_at: string | null;
  duration_seconds: number;
}

export interface HistoryResponse {
  location_uid: number;
  period: Period;
  items: HistoryItem[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${ENV.apiBase}${path}`, {
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export type HeatmapType = "all" | "shahed" | "missile" | "kab" | "aviation";

export interface HeatmapResponse {
  period: Period;
  event_type: HeatmapType;
  max_weight: number;
  computed_at: string;
  geojson: GeoJSON.FeatureCollection;
}

export const api = {
  statsSummary: (period: Period) =>
    get<SummaryResponse>(`/api/v1/stats/summary?period=${period}`),
  alertsHistory: (location_uid: number, period: Period) =>
    get<HistoryResponse>(`/api/v1/alerts/history?location_uid=${location_uid}&period=${period}`),
  heatmap: (period: Period, type: HeatmapType) =>
    get<HeatmapResponse>(`/api/v1/heatmap?period=${period}&type=${type}`),
};
