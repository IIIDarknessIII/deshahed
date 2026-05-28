"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { useAlertsStore, selectOblastStateMap } from "@/stores/alertsStore";
import { useDronesStore } from "@/stores/dronesStore";
import { useTracksStore } from "@/stores/tracksStore";
import { useUiStore } from "@/stores/uiStore";
import { UID_BY_TITLE } from "@/lib/locations";
import type { DroneEvent, DroneTrack } from "@/lib/types";
import { HeatmapController } from "@/components/HeatmapLayer";

const SOURCE_ID = "oblasts";
const FILL_LAYER = "oblasts-fill";
const LINE_LAYER = "oblasts-line";

const DRONES_SOURCE = "drones";
const DRONES_POINT_LAYER = "drones-point";
const DRONE_TRACKS_SOURCE = "drone-tracks";
const DRONE_TRACKS_LAYER = "drone-tracks";

const TRAJECTORIES_SOURCE = "trajectories";
const TRAJECTORIES_LINE_LAYER = "trajectories-line";
const TRAJECTORIES_HEAD_LAYER = "trajectories-head";

const HEATMAP_SOURCE = "heatmap";
const HEATMAP_FILL_LAYER = "heatmap-fill";

const PUSH_REGION_LS_KEY = "deshahed.pushRegion";
const PUSH_REGION_EVENT = "deshahed:pushRegionChange";

function readSubscribedOblast(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PUSH_REGION_LS_KEY);
}

// Delta-wing silhouette mimicking a shahed-style UAV; a tinted dot marks
// the warhead. We embed one variant per event_type to keep them colour-coded.
function droneSvg(fill: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <path d="M16 3 L28 25 L16 20 L4 25 Z"
            fill="${fill}" stroke="#0a0a0b" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="16" cy="20" r="2.2" fill="#fde047" stroke="#0a0a0b" stroke-width="0.8"/>
    </svg>`;
}

const DRONE_ICONS: Record<string, string> = {
  "drone-shahed": droneSvg("#fb923c"),
  "drone-missile": droneSvg("#dc2626"),
  "drone-kab": droneSvg("#a855f7"),
  "drone-aviation": droneSvg("#38bdf8"),
};

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(32, 32);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  });
}

async function registerDroneIcons(map: MapLibreMap): Promise<void> {
  for (const [name, svg] of Object.entries(DRONE_ICONS)) {
    if (map.hasImage(name)) continue;
    const img = await svgToImage(svg);
    if (!map.hasImage(name)) map.addImage(name, img, { pixelRatio: 2 });
  }
}

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0a0a0b" },
    },
  ],
};

export function Map() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const geojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const [maxWeight, setMaxWeight] = useState(1);

  const setHeatmapData = useCallback((fc: GeoJSON.FeatureCollection) => {
    const m = mapRef.current;
    if (!m) return;
    const src = m.getSource(HEATMAP_SOURCE) as maplibregl.GeoJSONSource | undefined;
    src?.setData(fc);
  }, []);

  const setHeatmapVisibility = useCallback((visible: boolean) => {
    const m = mapRef.current;
    if (!m) return;
    if (!m.getLayer(HEATMAP_FILL_LAYER)) return;
    m.setLayoutProperty(HEATMAP_FILL_LAYER, "visibility", visible ? "visible" : "none");
  }, []);

  // Re-paint the choropleth scale when max_weight changes — keeps the
  // color stretch meaningful as the dataset grows or shrinks.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer(HEATMAP_FILL_LAYER)) return;
    const max = Math.max(maxWeight, 1);
    m.setPaintProperty(HEATMAP_FILL_LAYER, "fill-color", [
      "interpolate",
      ["linear"],
      ["get", "weight"],
      0, "rgba(253, 224, 71, 0.15)",        // yellow-200
      max / 2, "rgba(249, 115, 22, 0.45)",  // orange-500
      max, "rgba(220, 38, 38, 0.75)",       // red-600
    ]);
  }, [maxWeight]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [31.2, 49.0],
      zoom: 5,
      attributionControl: false,
      maxZoom: 9,
      minZoom: 4,
    });
    mapRef.current = map;

    map.on("load", async () => {
      if (cancelled) return;
      const resp = await fetch("/geo/oblasts.geojson");
      if (cancelled) return;
      const geo = (await resp.json()) as GeoJSON.FeatureCollection;
      if (cancelled) return;
      geojsonRef.current = geo;

      // Mark each feature with state="safe" initially; we mutate state from store.
      for (const f of geo.features) {
        f.properties = { ...f.properties, state: "safe" };
      }

      map.addSource(SOURCE_ID, { type: "geojson", data: geo });

      map.addLayer({
        id: FILL_LAYER,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": [
            "match",
            ["get", "state"],
            "urban_fights", "#a855f7",
            "artillery_shelling", "#f97316",
            "air_raid_drone", "#b91c1c",
            "air_raid", "#ef4444",
            "#1f2937",
          ],
          "fill-opacity": [
            "match",
            ["get", "state"],
            "urban_fights", 0.55,
            "artillery_shelling", 0.5,
            "air_raid_drone", 0.5,
            "air_raid", 0.45,
            0.55,
          ],
        },
      });

      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "subscribed"], true], "#38bdf8",
            "#27272a",
          ],
          "line-width": [
            "case",
            ["==", ["get", "subscribed"], true], 2.2,
            1,
          ],
        },
      });

      // Heatmap — installed empty + invisible at startup; the HeatmapController
      // patches data + visibility based on uiStore.
      map.addSource(HEATMAP_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer(
        {
          id: HEATMAP_FILL_LAYER,
          type: "fill",
          source: HEATMAP_SOURCE,
          layout: { visibility: "none" },
          paint: {
            "fill-color": [
              "interpolate", ["linear"], ["get", "weight"],
              0, "rgba(253, 224, 71, 0.15)",
              0.5, "rgba(249, 115, 22, 0.45)",
              1, "rgba(220, 38, 38, 0.75)",
            ],
            "fill-outline-color": "rgba(0,0,0,0)",
          },
        },
        LINE_LAYER,
      );

      // Drones — direction line (under points) and the point itself.
      map.addSource(DRONE_TRACKS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource(DRONES_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      await registerDroneIcons(map);

      map.addLayer({
        id: DRONE_TRACKS_LAYER,
        type: "line",
        source: DRONE_TRACKS_SOURCE,
        paint: {
          "line-color": [
            "match",
            ["get", "event_type"],
            "shahed", "#fb923c",
            "missile", "#dc2626",
            "kab", "#a855f7",
            "aviation", "#38bdf8",
            "#9ca3af",
          ],
          "line-width": 1.2,
          "line-opacity": 0.7,
          "line-dasharray": [2, 1.5],
        },
      });
      map.addLayer({
        id: DRONES_POINT_LAYER,
        type: "symbol",
        source: DRONES_SOURCE,
        layout: {
          "icon-image": [
            "match",
            ["get", "event_type"],
            "shahed", "drone-shahed",
            "missile", "drone-missile",
            "kab", "drone-kab",
            "aviation", "drone-aviation",
            "drone-shahed",
          ],
          "icon-size": 0.55,
          "icon-allow-overlap": true,
          "icon-rotation-alignment": "map",
        },
      });

      // Multi-point trajectories (Phase 3). Solid line vs the dashed
      // direction-projection of single events.
      map.addSource(TRAJECTORIES_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer(
        {
          id: TRAJECTORIES_LINE_LAYER,
          type: "line",
          source: TRAJECTORIES_SOURCE,
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": [
              "match",
              ["get", "event_type"],
              "shahed", "#fb923c",
              "missile", "#dc2626",
              "kab", "#a855f7",
              "aviation", "#38bdf8",
              "#9ca3af",
            ],
            "line-width": 2,
            "line-opacity": 0.85,
          },
        },
        DRONE_TRACKS_LAYER,
      );
      map.addLayer(
        {
          id: TRAJECTORIES_HEAD_LAYER,
          type: "circle",
          source: TRAJECTORIES_SOURCE,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 4,
            "circle-color": [
              "match",
              ["get", "event_type"],
              "shahed", "#fb923c",
              "missile", "#dc2626",
              "kab", "#a855f7",
              "aviation", "#38bdf8",
              "#9ca3af",
            ],
            "circle-stroke-color": "#0a0a0b",
            "circle-stroke-width": 1,
            "circle-opacity": 0.95,
          },
        },
        DRONES_POINT_LAYER,
      );

      applyDroneState();
      applyTracksState();

      // Hover popup with region name + active-alert duration.
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "deshahed-popup",
        offset: 8,
      });

      const STATE_LABELS: Record<string, { label: string; color: string }> = {
        urban_fights: { label: "Загроза вуличних боїв", color: "text-purple-300" },
        artillery_shelling: { label: "Загроза артобстрілу", color: "text-orange-300" },
        air_raid_drone: { label: "Ударні/імітаційні БпЛА", color: "text-red-300" },
        air_raid: { label: "Повітряна тривога", color: "text-red-400" },
      };

      map.on("mousemove", FILL_LAYER, (e) => {
        if (cancelled || !e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = "pointer";
        const f = e.features[0];
        const title = (f.properties as { full_name_uk?: string } | null)?.full_name_uk ?? "";
        const states = selectOblastStateMap(useAlertsStore.getState());
        const state = title ? states.get(title) : undefined;
        let durationLabel = "";
        if (state) {
          for (const a of useAlertsStore.getState().alerts.values()) {
            if ((a.location_oblast || a.location_title) === title) {
              const ms = Date.now() - +new Date(a.started_at);
              const min = Math.max(0, Math.floor(ms / 60_000));
              durationLabel = min > 0 ? `${min} хв` : "щойно";
              break;
            }
          }
        }
        const meta = state ? STATE_LABELS[state] : null;
        const html = `
          <div class="px-2 py-1.5">
            <div class="text-[12px] font-medium text-zinc-100">${title}</div>
            ${
              meta
                ? `<div class="mt-0.5 text-[11px] ${meta.color}">${meta.label} · ${durationLabel}</div>`
                : `<div class="mt-0.5 text-[11px] text-zinc-500">Немає інформації про тривогу</div>`
            }
          </div>
        `;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });

      map.on("mouseleave", FILL_LAYER, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      map.on("click", FILL_LAYER, (e) => {
        if (cancelled || !e.features || e.features.length === 0) return;
        const f = e.features[0];
        const title = (f.properties as { full_name_uk?: string } | null)?.full_name_uk ?? "";
        const uid = UID_BY_TITLE[title];
        if (uid !== undefined) useUiStore.getState().selectLocation(uid);
      });

      // Initial paint from current store state.
      applyAlertState();
    });

    const applyAlertState = () => {
      const geo = geojsonRef.current;
      if (!geo || !mapRef.current) return;
      const states = selectOblastStateMap(useAlertsStore.getState());
      const subscribed = readSubscribedOblast();
      let changed = false;
      for (const f of geo.features) {
        const title = (f.properties as { full_name_uk?: string } | null)?.full_name_uk;
        const next = (title && states.get(title)) || "safe";
        const nextSubscribed = !!(title && subscribed && title === subscribed);
        const props = f.properties as { state?: string; subscribed?: boolean } | null;
        if (props?.state !== next || props?.subscribed !== nextSubscribed) {
          (f.properties as Record<string, unknown>).state = next;
          (f.properties as Record<string, unknown>).subscribed = nextSubscribed;
          changed = true;
        }
      }
      if (changed) {
        const src = mapRef.current.getSource(SOURCE_ID) as
          | maplibregl.GeoJSONSource
          | undefined;
        src?.setData(geo);
      }
    };

    const applyDroneState = () => {
      const m = mapRef.current;
      if (!m) return;
      const src = m.getSource(DRONES_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      const tracksSrc = m.getSource(DRONE_TRACKS_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src || !tracksSrc) return;
      const drones = Array.from(useDronesStore.getState().drones.values());
      src.setData({
        type: "FeatureCollection",
        features: drones.map(
          (d: DroneEvent): GeoJSON.Feature => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [d.location_lon, d.location_lat] },
            properties: { id: d.id, event_type: d.event_type, confidence: d.confidence },
          }),
        ),
      });
      tracksSrc.setData({
        type: "FeatureCollection",
        features: drones
          .filter((d) => d.direction_lat !== null && d.direction_lon !== null)
          .map(
            (d): GeoJSON.Feature => ({
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [d.location_lon, d.location_lat],
                  [d.direction_lon as number, d.direction_lat as number],
                ],
              },
              properties: { id: d.id, event_type: d.event_type },
            }),
          ),
      });
    };

    const applyTracksState = () => {
      const m = mapRef.current;
      if (!m) return;
      const src = m.getSource(TRAJECTORIES_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      const tracks = Array.from(useTracksStore.getState().tracks.values());
      const features: GeoJSON.Feature[] = [];
      for (const t of tracks) {
        if (t.path && t.path.coordinates.length >= 2) {
          features.push({
            type: "Feature",
            geometry: t.path,
            properties: {
              id: t.id,
              event_type: t.event_type,
              point_count: t.point_count,
            },
          });
        }
        // Head marker (always — gives a point even for single-point tracks).
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [t.last_lon, t.last_lat] },
          properties: {
            id: t.id,
            event_type: t.event_type,
            point_count: t.point_count,
            head: true,
          },
        });
      }
      src.setData({ type: "FeatureCollection", features });
    };

    const unsubscribe = useAlertsStore.subscribe(applyAlertState);
    const unsubscribeDrones = useDronesStore.subscribe(applyDroneState);
    const unsubscribeTracks = useTracksStore.subscribe(applyTracksState);

    const onPushRegionChange = () => applyAlertState();
    window.addEventListener("storage", onPushRegionChange);
    window.addEventListener(PUSH_REGION_EVENT, onPushRegionChange);

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeDrones();
      unsubscribeTracks();
      window.removeEventListener("storage", onPushRegionChange);
      window.removeEventListener(PUSH_REGION_EVENT, onPushRegionChange);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      <HeatmapController
        setData={setHeatmapData}
        setVisibility={setHeatmapVisibility}
        setMaxWeight={setMaxWeight}
      />
    </>
  );
}
