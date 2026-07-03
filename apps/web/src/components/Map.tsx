"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type ExpressionSpecification,
} from "maplibre-gl";
import {
  useAlertsStore,
  selectOblastAggregate,
  selectSubRegionStates,
} from "@/stores/alertsStore";
import { useDronesStore } from "@/stores/dronesStore";
import { useTracksStore } from "@/stores/tracksStore";
import { useUiStore, type BaseMap } from "@/stores/uiStore";
import { UID_BY_TITLE } from "@/lib/locations";
import type { DroneEvent, DroneTrack } from "@/lib/types";
import { objectInfo, typicalSpeed, typicalAltitude, compass } from "@/lib/objectInfo";
import { HeatmapController } from "@/components/HeatmapLayer";

const SOURCE_ID = "oblasts";
const FILL_LAYER = "oblasts-fill";
const LINE_LAYER = "oblasts-line";
const LABEL_LAYER = "oblasts-label";
// Single label anchor per oblast (largest-part representative point). Labelling
// the polygon source directly duplicates labels on island/delta multipolygons.
const OBLAST_LABELS_SOURCE = "oblast-labels";

const DRONES_SOURCE = "drones";
const DRONES_POINT_LAYER = "drones-point";
const DRONE_TRACKS_SOURCE = "drone-tracks";
const DRONE_TRACKS_LAYER = "drone-tracks";
const DRONE_ARROWS_SOURCE = "drone-arrows";
const DRONE_ARROWS_LAYER = "drone-arrows";

// Threat-type markers placed at region centroids (currently artillery-shelling
// on oblasts). Driven by the oblast aggregate + the one-point-per-oblast source.
const THREAT_ICONS_SOURCE = "threat-icons";
const THREAT_ICONS_LAYER = "threat-icons";

const TRAJECTORIES_SOURCE = "trajectories";
const TRAJECTORIES_LINE_LAYER = "trajectories-line";
const TRAJECTORIES_HEAD_LAYER = "trajectories-head";

const HEATMAP_SOURCE = "heatmap";
const HEATMAP_FILL_LAYER = "heatmap-fill";

// Optional "political" basemap — a real dark reference map (borders, cities,
// roads, place names) rendered *under* the threat overlays. Tiles: CARTO Dark
// Matter (free, OpenStreetMap-based). Toggled via uiStore.baseMap.
const POLITICAL_SOURCE = "political-base";
const POLITICAL_LAYER = "political-base";
const POLITICAL_TILES = [
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
];

// Show/hide the political basemap. When it's on, "safe" oblasts become
// transparent so the real map shows through (only active alerts stay tinted).
function applyBaseMapStyle(map: MapLibreMap, baseMap: BaseMap): void {
  const political = baseMap === "political";
  if (map.getLayer(POLITICAL_LAYER)) {
    map.setLayoutProperty(POLITICAL_LAYER, "visibility", political ? "visible" : "none");
  }
  if (map.getLayer(FILL_LAYER)) {
    map.setPaintProperty(FILL_LAYER, "fill-opacity", [
      "match",
      ["get", "state"],
      "urban_fights", political ? 0.6 : 0.55,
      "artillery_shelling", political ? 0.55 : 0.5,
      "air_raid", political ? 0.5 : 0.45,
      political ? 0 : 0.55,
    ]);
  }
}

const RAIONS_SOURCE = "raions";
const RAIONS_FILL = "raions-fill";
const RAIONS_LINE = "raions-line";

const HROMADAS_SOURCE = "hromadas";
const HROMADAS_FILL = "hromadas-fill";
const HROMADAS_LINE = "hromadas-line";

// Zoom bands — only one administrative fill is active at a time so the layers
// never double-paint. maxZoom on the map is 9.
const RAION_MIN_ZOOM = 6;
const HROMADA_MIN_ZOOM = 7.5;

// ---- Single-source map style expressions ----------------------------------
// These MapLibre `match` expressions were previously copy-pasted at each layer.
// Hoisting them here means an alert state or object type has exactly one colour
// and one sprite across the oblast fill, sub-region fill, drone points, tracks
// and trajectories.

// Alert-state → choropleth fill colour (oblast + sub-region fills).
const STATE_FILL_COLOR: ExpressionSpecification = [
  "match",
  ["get", "state"],
  "urban_fights", "#a855f7",
  "artillery_shelling", "#f97316",
  "air_raid", "#ef4444",
  "#1f2937",
];

// event_type → line/point colour (drone points, dashed tracks, trajectories).
const EVENT_TYPE_COLOR: ExpressionSpecification = [
  "match",
  ["get", "event_type"],
  "shahed", "#fb923c",
  "recon", "#2dd4bf",
  "missile", "#dc2626",
  "kab", "#a855f7",
  "aviation", "#38bdf8",
  "#9ca3af",
];

// event_type → registered sprite name (drone points + trajectory heads).
const EVENT_TYPE_ICON: ExpressionSpecification = [
  "match",
  ["get", "event_type"],
  "shahed", "drone-shahed",
  "recon", "drone-recon",
  "missile", "drone-missile",
  "kab", "drone-kab",
  "aviation", "drone-aviation",
  "unknown", "drone-unknown",
  "drone-unknown",
];

// Shared choropleth paint for the sub-region fills. "safe" is fully
// transparent so only regions with an active alert tint the map.
const SUBREGION_FILL_PAINT: maplibregl.FillLayerSpecification["paint"] = {
  "fill-color": [
    "case",
    // Hovered region with no active alert → neutral sky highlight so it reads.
    ["all", ["boolean", ["feature-state", "hover"], false], ["==", ["get", "state"], "safe"]],
    "#38bdf8",
    STATE_FILL_COLOR,
  ],
  // Hover bumps the fill so the region under the cursor is obvious, even when safe.
  "fill-opacity": [
    "case",
    ["boolean", ["feature-state", "hover"], false],
    ["match", ["get", "state"], "urban_fights", 0.75, "artillery_shelling", 0.7, "air_raid", 0.65, 0.3],
    ["match", ["get", "state"], "urban_fights", 0.6, "artillery_shelling", 0.55, "air_raid", 0.5, 0],
  ],
};

// Shared line paint for sub-region outlines — brighter + thicker on hover.
const SUBREGION_LINE_PAINT = (base: number): maplibregl.LineLayerSpecification["paint"] => ({
  "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#7dd3fc", "#52525b"],
  "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, base],
  "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.85],
});

const SHELTERS_SOURCE = "shelters";
const SHELTERS_CLUSTER_LAYER = "shelters-cluster";
const SHELTERS_CLUSTER_COUNT = "shelters-cluster-count";
const SHELTERS_POINT_LAYER = "shelters-point";

const PUSH_REGION_LS_KEY = "deshahed.pushRegion";
const PUSH_REGION_EVENT = "deshahed:pushRegionChange";

function readSubscribedOblast(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PUSH_REGION_LS_KEY);
}

// All icons are drawn nose-up (pointing north); the point layer rotates them
// by the event's computed bearing so they face where the object is heading.

// Delta-wing silhouette mimicking a shahed-style UAV; a tinted dot marks
// the warhead.
function droneSvg(fill: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <path d="M16 3 L28 25 L16 20 L4 25 Z"
            fill="${fill}" stroke="#0a0a0b" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="16" cy="20" r="2.2" fill="#fde047" stroke="#0a0a0b" stroke-width="0.8"/>
    </svg>`;
}

// Slender rocket/missile silhouette (body + nose cone + tail fins + flame) so
// a missile reads instantly differently from a shahed.
function missileSvg(fill: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <path d="M16 2 C20 7 20.5 12 20.5 17 L20.5 23 L11.5 23 L11.5 17 C11.5 12 12 7 16 2 Z"
            fill="${fill}" stroke="#0a0a0b" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M11.5 19 L6.5 26 L11.5 23 Z" fill="${fill}" stroke="#0a0a0b" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M20.5 19 L25.5 26 L20.5 23 Z" fill="${fill}" stroke="#0a0a0b" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M13.5 23 L16 30 L18.5 23 Z" fill="#fde047" stroke="#0a0a0b" stroke-width="0.6" stroke-linejoin="round"/>
    </svg>`;
}

// Chevron arrowhead, nose-up — dropped at the projected impact point to make
// the direction of travel explicit.
function arrowSvg(fill: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <path d="M16 5 L26 25 L16 19 L6 25 Z"
            fill="${fill}" stroke="#0a0a0b" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>`;
}

// Star-burst marking a region under artillery-shelling threat.
function artillerySvg(): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <path d="M16 3 L19 12 L28 9 L21 16 L28 23 L19 20 L16 29 L13 20 L4 23 L11 16 L4 9 L13 12 Z"
            fill="#f97316" stroke="#0a0a0b" stroke-width="1.3" stroke-linejoin="round"/>
      <circle cx="16" cy="16" r="3" fill="#fde047" stroke="#0a0a0b" stroke-width="0.8"/>
    </svg>`;
}

const DRONE_ICONS: Record<string, string> = {
  "drone-missile": missileSvg("#dc2626"),
  "drone-kab": droneSvg("#a855f7"),
  "drone-aviation": droneSvg("#38bdf8"),
  "dir-arrow": arrowSvg("#fca5a5"),
  "threat-artillery": artillerySvg(),
};

// Real raster icons (red silhouettes, served from /public/icons) for the
// primary UAV types — these replace the generic delta-wing/dot SVGs above.
const DRONE_PNG_ICONS: Record<string, string> = {
  "drone-shahed": "/icons/shahed.png",
  "drone-recon": "/icons/orlan10.png",
  "drone-unknown": "/icons/unknown.png",
};

// Great-circle bearing in degrees (0 = north, clockwise) from A to B —
// used to rotate the icons toward each object's projected direction.
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(32, 32);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  });
}

// Rasterize a (possibly non-square) PNG into a square, aspect-preserving
// ImageData so MapLibre can use it as a symbol. A 64 px canvas at pixelRatio 4
// → ~16 logical px, matching the SVG icons registered above.
function pngToImageData(url: string, size = 64): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no 2d context"));
      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(ctx.getImageData(0, 0, size, size));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function registerDroneIcons(map: MapLibreMap): Promise<void> {
  for (const [name, svg] of Object.entries(DRONE_ICONS)) {
    if (map.hasImage(name)) continue;
    const img = await svgToImage(svg);
    if (!map.hasImage(name)) map.addImage(name, img, { pixelRatio: 2 });
  }
  for (const [name, url] of Object.entries(DRONE_PNG_ICONS)) {
    if (map.hasImage(name)) continue;
    try {
      const data = await pngToImageData(url);
      if (!map.hasImage(name)) map.addImage(name, data, { pixelRatio: 4 });
    } catch {
      /* missing/broken icon asset — symbol layer falls back to default */
    }
  }
}

// MapLibre demo glyphs CDN — supports Cyrillic via "Noto Sans Regular".
// Used only for oblast labels; map tiles are not from this host.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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
  const raionsGeoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const hromadasGeoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const hromadasAddedRef = useRef(false);
  const oblastLabelsRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const hoverRef = useRef<{ source: string; id: number | string } | null>(null);
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

  // Reactive shelters visibility — three layers toggled together.
  const sheltersOn = useUiStore((s) => s.sheltersOn);
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const v = sheltersOn ? "visible" : "none";
    for (const id of [SHELTERS_CLUSTER_LAYER, SHELTERS_CLUSTER_COUNT, SHELTERS_POINT_LAYER]) {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", v);
    }
  }, [sheltersOn]);

  // Reactive base-map mode — toggles the political basemap layer on/off.
  const baseMap = useUiStore((s) => s.baseMap);
  useEffect(() => {
    const m = mapRef.current;
    if (m) applyBaseMapStyle(m, baseMap);
  }, [baseMap]);

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

    // Touch-friendly controls. Compass is hidden (we never rotate); the
    // geolocate button lets users jump to their own region quickly.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: true,
      }),
      "top-right",
    );

    map.on("load", async () => {
      if (cancelled) return;

      // Political basemap (added first → sits at the very bottom, above the
      // background). Hidden unless the user switches to "political" mode.
      map.addSource(POLITICAL_SOURCE, {
        type: "raster",
        tiles: POLITICAL_TILES,
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
      });
      map.addLayer({
        id: POLITICAL_LAYER,
        type: "raster",
        source: POLITICAL_SOURCE,
        layout: { visibility: "none" },
      });

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
        // Hand off to the raion choropleth once the user zooms past the
        // country-overview band.
        maxzoom: RAION_MIN_ZOOM,
        paint: {
          "fill-color": STATE_FILL_COLOR,
          "fill-opacity": [
            "match",
            ["get", "state"],
            "urban_fights", 0.55,
            "artillery_shelling", 0.5,
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

      // Oblast names from a dedicated one-point-per-oblast source (avoids the
      // duplicate labels MultiPolygon parts produce). Cyrillic glyphs come from
      // the demotiles CDN declared on STYLE.glyphs.
      const olResp = await fetch("/geo/oblast_labels.geojson");
      if (cancelled) return;
      const oblastLabels = (await olResp.json()) as GeoJSON.FeatureCollection;
      if (cancelled) return;
      oblastLabelsRef.current = oblastLabels;
      map.addSource(OBLAST_LABELS_SOURCE, { type: "geojson", data: oblastLabels });
      map.addLayer({
        id: LABEL_LAYER,
        type: "symbol",
        source: OBLAST_LABELS_SOURCE,
        layout: {
          "text-field": ["get", "name_uk"],
          "text-font": ["Noto Sans Regular"],
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            4, 9,
            6, 11,
            8, 13,
          ],
          "text-anchor": "center",
          "text-allow-overlap": false,
          "text-padding": 3,
          "text-max-width": 8,
          "symbol-placement": "point",
        },
        paint: {
          "text-color": "#e4e4e7",
          "text-halo-color": "#0a0a0b",
          "text-halo-width": 1.4,
          "text-halo-blur": 0.4,
        },
      });

      // Artillery-threat markers — a star-burst at the centroid of every oblast
      // whose aggregate state is artillery_shelling (rebuilt in applyThreatIcons).
      map.addSource(THREAT_ICONS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: THREAT_ICONS_LAYER,
        type: "symbol",
        source: THREAT_ICONS_SOURCE,
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 7, 0.85],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-anchor": "bottom",
          // Sit just above the oblast name (shares its anchor point).
          "icon-offset": [0, -14],
        },
      });

      // Raion choropleth (OSM admin level 6, ~0.7 MB, loaded eagerly). The
      // sub-region fill sits *below* the oblast border line so oblast outlines
      // and labels stay legible on top. Hromadas are loaded lazily on zoom-in
      // (addHromadas) to keep the initial payload small.
      {
        const rResp = await fetch("/geo/raions.geojson");
        if (cancelled) return;
        const raions = (await rResp.json()) as GeoJSON.FeatureCollection;
        if (cancelled) return;
        raionsGeoRef.current = raions;
        // generateId lets us drive the hover highlight via feature-state.
        map.addSource(RAIONS_SOURCE, { type: "geojson", data: raions, generateId: true });
        map.addLayer(
          {
            id: RAIONS_FILL,
            type: "fill",
            source: RAIONS_SOURCE,
            minzoom: RAION_MIN_ZOOM,
            maxzoom: HROMADA_MIN_ZOOM,
            paint: SUBREGION_FILL_PAINT,
          },
          LINE_LAYER,
        );
        map.addLayer(
          {
            id: RAIONS_LINE,
            type: "line",
            source: RAIONS_SOURCE,
            minzoom: RAION_MIN_ZOOM,
            paint: SUBREGION_LINE_PAINT(0.7),
          },
          LINE_LAYER,
        );
      }

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
      map.addSource(DRONE_ARROWS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      await registerDroneIcons(map);

      map.addLayer({
        id: DRONE_TRACKS_LAYER,
        type: "line",
        source: DRONE_TRACKS_SOURCE,
        paint: {
          "line-color": EVENT_TYPE_COLOR,
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
          "icon-image": EVENT_TYPE_ICON,
          // ~40 px at country overview, ~28 px when zoomed in. Source
          // image is 32 px, so 1.4 == ~45 px on the canvas at z4.
          // Grow with zoom so icons stay easy to tap on phones when zoomed in
          // (they used to shrink, becoming near-impossible to hit on mobile).
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            4, 1.5,
            6, 1.9,
            9, 2.4,
          ],
          "icon-allow-overlap": true,
          // Don't reserve space in the collision index — otherwise a drone icon
          // sitting over an oblast label hides the label (which has
          // text-allow-overlap:false). Drones float above; labels stay.
          "icon-ignore-placement": true,
          "icon-rotation-alignment": "map",
          // Point the silhouette toward its projected direction when known.
          "icon-rotate": ["coalesce", ["get", "bearing"], 0],
        },
      });

      // Arrowhead at the projected impact point — an explicit "flies to here".
      map.addLayer({
        id: DRONE_ARROWS_LAYER,
        type: "symbol",
        source: DRONE_ARROWS_SOURCE,
        layout: {
          "icon-image": "dir-arrow",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 8, 0.5],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-rotation-alignment": "map",
          "icon-rotate": ["coalesce", ["get", "bearing"], 0],
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
            "line-color": EVENT_TYPE_COLOR,
            "line-width": 2,
            "line-opacity": 0.85,
          },
        },
        DRONE_TRACKS_LAYER,
      );
      // Trajectory head — the type silhouette (rocket / shahed / …) at the
      // leading end, rotated to the track's heading. Previously a plain circle.
      map.addLayer(
        {
          id: TRAJECTORIES_HEAD_LAYER,
          type: "symbol",
          source: TRAJECTORIES_SOURCE,
          filter: ["==", ["geometry-type"], "Point"],
          layout: {
            "icon-image": EVENT_TYPE_ICON,
            "icon-size": [
              "interpolate", ["linear"], ["zoom"],
              4, 1.5,
              6, 1.9,
              9, 2.4,
            ],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-rotation-alignment": "map",
            "icon-rotate": ["coalesce", ["get", "bearing"], 0],
          },
        },
        DRONES_POINT_LAYER,
      );

      // Shelters — OSM amenity=shelter + military=bunker filtered to bomb-
      // shelter-relevant subtypes (see public/geo/shelters.geojson). Heavy
      // dataset (~14k points) so we cluster aggressively until z11.
      map.addSource(SHELTERS_SOURCE, {
        type: "geojson",
        data: "/geo/shelters.geojson",
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 11,
      });
      map.addLayer({
        id: SHELTERS_CLUSTER_LAYER,
        type: "circle",
        source: SHELTERS_SOURCE,
        filter: ["has", "point_count"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": "#16a34a",
          "circle-stroke-color": "#0a0a0b",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.85,
          "circle-radius": [
            "step", ["get", "point_count"],
            10, 25, 14, 100, 18, 500, 22,
          ],
        },
      });
      map.addLayer({
        id: SHELTERS_CLUSTER_COUNT,
        type: "symbol",
        source: SHELTERS_SOURCE,
        filter: ["has", "point_count"],
        layout: {
          visibility: "none",
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: { "text-color": "#0a0a0b" },
      });
      map.addLayer({
        id: SHELTERS_POINT_LAYER,
        type: "circle",
        source: SHELTERS_SOURCE,
        filter: ["!", ["has", "point_count"]],
        layout: { visibility: "none" },
        paint: {
          "circle-color": "#22c55e",
          "circle-stroke-color": "#0a0a0b",
          "circle-stroke-width": 1.2,
          "circle-radius": 5,
          "circle-opacity": 0.95,
        },
      });

      // Shelter point popup on hover.
      const shelterPopup = new maplibregl.Popup({
        closeButton: false, closeOnClick: false, className: "deshahed-popup", offset: 6,
      });
      map.on("mouseenter", SHELTERS_POINT_LAYER, (e) => {
        if (!e.features || !e.features.length) return;
        map.getCanvas().style.cursor = "pointer";
        const p = (e.features[0].properties ?? {}) as { name?: string; addr?: string };
        const html = `
          <div class="px-2 py-1.5 max-w-[260px]">
            <div class="text-[12px] font-medium text-emerald-300">Укриття</div>
            <div class="mt-0.5 text-[11px] text-zinc-100">${(p.name ?? "Без назви").replace(/[<>]/g, "")}</div>
            ${p.addr ? `<div class="text-[11px] text-zinc-400">${String(p.addr).replace(/[<>]/g, "")}</div>` : ""}
          </div>`;
        shelterPopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on("mouseleave", SHELTERS_POINT_LAYER, () => {
        map.getCanvas().style.cursor = "";
        shelterPopup.remove();
      });
      // Click a cluster → zoom in.
      map.on("click", SHELTERS_CLUSTER_LAYER, async (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const clusterId = (feat.properties as { cluster_id?: number }).cluster_id;
        if (clusterId == null) return;
        const src = map.getSource(SHELTERS_SOURCE) as maplibregl.GeoJSONSource;
        try {
          const zoom = await src.getClusterExpansionZoom(clusterId);
          const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
          map.easeTo({ center: coords, zoom });
        } catch { /* fine */ }
      });

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
        air_raid: { label: "Повітряна тривога", color: "text-red-400" },
      };

      const escapeHtml = (s: string) =>
        s.replace(/[&<>"']/g, (c) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
        );

      map.on("mousemove", FILL_LAYER, (e) => {
        if (cancelled || !e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = "pointer";
        const f = e.features[0];
        const title = (f.properties as { full_name_uk?: string } | null)?.full_name_uk ?? "";
        const aggregates = selectOblastAggregate(useAlertsStore.getState());
        const agg = title ? aggregates.get(title) : undefined;
        const meta = agg ? STATE_LABELS[agg.state] : null;

        let durationLabel = "";
        if (agg && agg.oblast_level) {
          for (const a of useAlertsStore.getState().alerts.values()) {
            if ((a.location_oblast || a.location_title) === title
              && (a.location_type === "oblast" || a.location_type === "autonomous_republic")) {
              const ms = Date.now() - +new Date(a.started_at);
              const min = Math.max(0, Math.floor(ms / 60_000));
              durationLabel = min > 0 ? ` · ${min} хв` : " · щойно";
              break;
            }
          }
        }

        const subListHtml = agg && agg.sub.length
          ? `<ul class="mt-1.5 space-y-0.5 border-t border-zinc-700/60 pt-1.5 text-[11px] text-zinc-300">
              ${agg.sub.slice(0, 6).map((s) => {
                const subMeta = STATE_LABELS[s.state] ?? { label: s.alert_type, color: "text-zinc-400" };
                return `<li class="${subMeta.color}">${escapeHtml(s.title)} <span class="text-zinc-500">— ${subMeta.label}</span></li>`;
              }).join("")}
              ${agg.sub.length > 6 ? `<li class="text-zinc-500">…ще ${agg.sub.length - 6}</li>` : ""}
            </ul>`
          : "";

        const headerHtml = meta
          ? `<div class="mt-0.5 text-[11px] ${meta.color}">${meta.label}${durationLabel}</div>`
          : `<div class="mt-0.5 text-[11px] text-zinc-500">Немає інформації про тривогу</div>`;

        const html = `
          <div class="px-2 py-1.5 max-w-[260px]">
            <div class="text-[12px] font-medium text-zinc-100">${escapeHtml(title)}</div>
            ${headerHtml}
            ${subListHtml}
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
        // A drone icon sits on top of the oblast fill — if the click landed on
        // one, it owns the click (opens the object modal); don't also open the
        // region history underneath.
        const onDrone = map.queryRenderedFeatures(e.point, {
          layers: [DRONES_POINT_LAYER, TRAJECTORIES_HEAD_LAYER],
        });
        if (onDrone.length > 0) return;
        const f = e.features[0];
        const title = (f.properties as { full_name_uk?: string } | null)?.full_name_uk ?? "";
        const uid = UID_BY_TITLE[title];
        if (uid !== undefined) useUiStore.getState().selectLocation(uid);
      });

      // ---- Drone objects: hover summary popup + click → detail modal ----
      const dronePopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "deshahed-popup",
        offset: 14,
      });
      const droneOnMove = (e: maplibregl.MapLayerMouseEvent) => {
        if (cancelled || !e.features || !e.features.length) return;
        map.getCanvas().style.cursor = "pointer";
        const p = (e.features[0].properties ?? {}) as {
          event_type?: string;
          bearing?: number;
          confidence?: string;
        };
        const info = objectInfo(p.event_type ?? "unknown");
        const hasDir = typeof p.bearing === "number" && p.bearing !== 0;
        const c = hasDir ? compass(p.bearing as number) : null;
        const courseLine = c
          ? `<div class="text-[11px] text-zinc-300">Курс: <span class="text-zinc-100">${Math.round(p.bearing as number)}° ${c.abbr}</span></div>`
          : `<div class="text-[11px] text-zinc-500">Курс: невідомо</div>`;
        const html = `
          <div class="px-2 py-1.5 max-w-[230px]">
            <div class="text-[12px] font-semibold" style="color:${info.accent}">${escapeHtml(info.label)}</div>
            ${courseLine}
            <div class="text-[11px] text-zinc-400">Швидкість: ${escapeHtml(typicalSpeed(info))} <span class="text-zinc-600">(типова)</span></div>
            <div class="text-[11px] text-zinc-400">Висота: ${escapeHtml(typicalAltitude(info))} <span class="text-zinc-600">(типова)</span></div>
            <div class="mt-1 text-[10px] text-zinc-500">Натисніть для деталей</div>
          </div>`;
        dronePopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      };
      const droneOnLeave = () => {
        map.getCanvas().style.cursor = "";
        dronePopup.remove();
      };
      const droneOnClick = (e: maplibregl.MapLayerMouseEvent) => {
        if (cancelled || !e.features || !e.features.length) return;
        const id = (e.features[0].properties as { id?: number } | null)?.id;
        if (typeof id === "number") useUiStore.getState().selectDrone(id);
      };
      for (const layer of [DRONES_POINT_LAYER, TRAJECTORIES_HEAD_LAYER]) {
        map.on("mousemove", layer, droneOnMove);
        map.on("mouseleave", layer, droneOnLeave);
        map.on("click", layer, droneOnClick);
      }

      // Raion / hromada hover popup — region name + its own alert state and
      // duration (looked up by the normalized match key on the feature).
      const subPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "deshahed-popup",
        offset: 8,
      });
      // Feature-state hover highlight — clears the previous region, lights up
      // the one under the cursor (works across the raion + hromada sources).
      const setHover = (source: string, id: number | string | undefined) => {
        const prev = hoverRef.current;
        if (prev && (prev.source !== source || prev.id !== id)) {
          map.setFeatureState({ source: prev.source, id: prev.id }, { hover: false });
          hoverRef.current = null;
        }
        if (id !== undefined) {
          map.setFeatureState({ source, id }, { hover: true });
          hoverRef.current = { source, id };
        }
      };
      const clearHover = () => {
        const prev = hoverRef.current;
        if (prev) map.setFeatureState({ source: prev.source, id: prev.id }, { hover: false });
        hoverRef.current = null;
      };

      const onSubMove = (e: maplibregl.MapLayerMouseEvent) => {
        if (cancelled || !e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = "pointer";
        const feat = e.features[0];
        setHover(feat.source, feat.id);
        const p = (feat.properties ?? {}) as { name_uk?: string; mkey?: string };
        const states = selectSubRegionStates(useAlertsStore.getState());
        const sr = p.mkey ? states.get(p.mkey) : undefined;
        const meta = sr ? STATE_LABELS[sr.state] : null;
        let durationLabel = "";
        if (sr) {
          const min = Math.max(0, Math.floor((Date.now() - +new Date(sr.started_at)) / 60_000));
          durationLabel = min > 0 ? ` · ${min} хв` : " · щойно";
        }
        const header = meta
          ? `<div class="mt-0.5 text-[11px] ${meta.color}">${meta.label}${durationLabel}</div>`
          : `<div class="mt-0.5 text-[11px] text-zinc-500">Немає інформації про тривогу</div>`;
        subPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="px-2 py-1.5 max-w-[240px]"><div class="text-[12px] font-medium text-zinc-100">${escapeHtml(p.name_uk ?? "")}</div>${header}</div>`,
          )
          .addTo(map);
      };
      const onSubLeave = () => {
        map.getCanvas().style.cursor = "";
        subPopup.remove();
        clearHover();
      };
      map.on("mousemove", RAIONS_FILL, onSubMove);
      map.on("mouseleave", RAIONS_FILL, onSubLeave);

      // Hromadas (admin level 7, ~1.75 MB) are fetched only once the user
      // zooms in far enough to need them, then wired up the same way.
      const addHromadas = async () => {
        if (hromadasAddedRef.current) return;
        hromadasAddedRef.current = true;
        try {
          const hResp = await fetch("/geo/hromadas.geojson");
          const hromadas = (await hResp.json()) as GeoJSON.FeatureCollection;
          if (cancelled || map.getSource(HROMADAS_SOURCE)) return;
          hromadasGeoRef.current = hromadas;
          map.addSource(HROMADAS_SOURCE, { type: "geojson", data: hromadas, generateId: true });
          map.addLayer(
            {
              id: HROMADAS_FILL,
              type: "fill",
              source: HROMADAS_SOURCE,
              minzoom: HROMADA_MIN_ZOOM,
              paint: SUBREGION_FILL_PAINT,
            },
            LINE_LAYER,
          );
          map.addLayer(
            {
              id: HROMADAS_LINE,
              type: "line",
              source: HROMADAS_SOURCE,
              minzoom: HROMADA_MIN_ZOOM,
              paint: SUBREGION_LINE_PAINT(0.5),
            },
            LINE_LAYER,
          );
          map.on("mousemove", HROMADAS_FILL, onSubMove);
          map.on("mouseleave", HROMADAS_FILL, onSubLeave);
          applySubState();
        } catch {
          hromadasAddedRef.current = false; // allow a retry on the next zoom
        }
      };
      map.on("zoom", () => {
        if (!hromadasAddedRef.current && map.getZoom() >= HROMADA_MIN_ZOOM) addHromadas();
      });

      // Initial paint from current store state.
      applyAlertState();
      applySubState();
      applyBaseMapStyle(map, useUiStore.getState().baseMap);
    });

    const applyAlertState = () => {
      const geo = geojsonRef.current;
      if (!geo || !mapRef.current) return;
      const aggregates = selectOblastAggregate(useAlertsStore.getState());
      const subscribed = readSubscribedOblast();
      let changed = false;
      for (const f of geo.features) {
        const title = (f.properties as { full_name_uk?: string } | null)?.full_name_uk;
        const agg = title ? aggregates.get(title) : undefined;
        const next = agg?.state ?? "safe";
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
      applyThreatIcons();
    };

    // Place an artillery-burst marker at the centroid of each oblast whose
    // aggregate state is artillery_shelling (escalated from its raions too).
    const applyThreatIcons = () => {
      const m = mapRef.current;
      const labels = oblastLabelsRef.current;
      if (!m || !labels) return;
      const aggregates = selectOblastAggregate(useAlertsStore.getState());
      const feats: GeoJSON.Feature[] = [];
      for (const f of labels.features) {
        const title = (f.properties as { full_name_uk?: string } | null)?.full_name_uk;
        const agg = title ? aggregates.get(title) : undefined;
        if (agg && agg.state === "artillery_shelling") {
          feats.push({
            type: "Feature",
            geometry: f.geometry,
            properties: { icon: "threat-artillery", title },
          });
        }
      }
      (m.getSource(THREAT_ICONS_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: feats,
      });
    };

    // Repaint raion + hromada fills from their own alert state, matched by the
    // normalized `mkey` property. Hromadas are skipped until lazily loaded.
    const applySubState = () => {
      const m = mapRef.current;
      if (!m) return;
      const states = selectSubRegionStates(useAlertsStore.getState());
      const layers = [
        [raionsGeoRef, RAIONS_SOURCE],
        [hromadasGeoRef, HROMADAS_SOURCE],
      ] as const;
      for (const [ref, srcId] of layers) {
        const geo = ref.current;
        if (!geo) continue;
        let changed = false;
        for (const f of geo.features) {
          const k = (f.properties as { mkey?: string } | null)?.mkey;
          const next = (k && states.get(k)?.state) || "safe";
          const props = f.properties as { state?: string } | null;
          if (props?.state !== next) {
            (f.properties as Record<string, unknown>).state = next;
            changed = true;
          }
        }
        if (changed) {
          (m.getSource(srcId) as maplibregl.GeoJSONSource | undefined)?.setData(geo);
        }
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
      const arrowsSrc = m.getSource(DRONE_ARROWS_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src || !tracksSrc || !arrowsSrc) return;
      const drones = Array.from(useDronesStore.getState().drones.values());

      // Fan out objects that share (almost) the same coordinate so their icons
      // don't stack on top of each other (common with the oblast-centroid
      // fallback or repeated reports of one settlement). Group by rounded
      // lng/lat and lay each member out on a phyllotaxis spiral around the
      // shared point, sized in *pixels* (recomputed on zoomend) so the spacing
      // stays constant on screen at any zoom.
      const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
      const z = m.getZoom();
      const iconPx = 16 * (
        z <= 4 ? 1.5
        : z >= 9 ? 2.4
        : z < 6 ? 1.5 + (1.9 - 1.5) * (z - 4) / 2
        : 1.9 + (2.4 - 1.9) * (z - 6) / 3
      );
      const step = iconPx * 1.15; // ≈ one icon between neighbours
      const groups = new globalThis.Map<string, DroneEvent[]>();
      for (const d of drones) {
        const key = `${d.location_lon.toFixed(4)},${d.location_lat.toFixed(4)}`;
        const g = groups.get(key);
        if (g) g.push(d);
        else groups.set(key, [d]);
      }
      const displayAt = new globalThis.Map<number, [number, number]>();
      for (const members of groups.values()) {
        if (members.length === 1) {
          const d = members[0];
          displayAt.set(d.id, [d.location_lon, d.location_lat]);
          continue;
        }
        const c = m.project([members[0].location_lon, members[0].location_lat]);
        members.forEach((d, i) => {
          const r = step * Math.sqrt(i + 0.5);
          const a = (i + 0.5) * GOLDEN_ANGLE;
          const p = m.unproject([c.x + r * Math.cos(a), c.y + r * Math.sin(a)]);
          displayAt.set(d.id, [p.lng, p.lat]);
        });
      }
      const coordOf = (d: DroneEvent): [number, number] =>
        displayAt.get(d.id) ?? [d.location_lon, d.location_lat];

      const bearingOf = (d: DroneEvent): number =>
        d.direction_lat !== null && d.direction_lon !== null
          ? bearingDeg(d.location_lat, d.location_lon, d.direction_lat, d.direction_lon)
          : 0;

      src.setData({
        type: "FeatureCollection",
        features: drones.map(
          (d: DroneEvent): GeoJSON.Feature => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: coordOf(d) },
            properties: {
              id: d.id,
              event_type: d.event_type,
              confidence: d.confidence,
              bearing: bearingOf(d),
            },
          }),
        ),
      });

      const withDir = drones.filter(
        (d) => d.direction_lat !== null && d.direction_lon !== null,
      );
      tracksSrc.setData({
        type: "FeatureCollection",
        features: withDir.map(
          (d): GeoJSON.Feature => ({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                coordOf(d),
                [d.direction_lon as number, d.direction_lat as number],
              ],
            },
            properties: { id: d.id, event_type: d.event_type },
          }),
        ),
      });
      arrowsSrc.setData({
        type: "FeatureCollection",
        features: withDir.map(
          (d): GeoJSON.Feature => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [d.direction_lon as number, d.direction_lat as number],
            },
            properties: { id: d.id, event_type: d.event_type, bearing: bearingOf(d) },
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
        // Heading from the last path segment, so the head icon faces forward.
        let bearing = 0;
        if (t.path && t.path.coordinates.length >= 2) {
          const c = t.path.coordinates;
          const [lon1, lat1] = c[c.length - 2];
          const [lon2, lat2] = c[c.length - 1];
          bearing = bearingDeg(lat1, lon1, lat2, lon2);
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
            bearing,
          },
        });
      }
      src.setData({ type: "FeatureCollection", features });
    };

    const unsubscribe = useAlertsStore.subscribe(applyAlertState);
    const unsubscribeSub = useAlertsStore.subscribe(applySubState);
    const unsubscribeDrones = useDronesStore.subscribe(applyDroneState);
    const unsubscribeTracks = useTracksStore.subscribe(applyTracksState);
    // Re-fan colocated objects on zoom change so the on-screen spacing between
    // them stays constant (the offsets are computed in pixels).
    map.on("zoomend", applyDroneState);

    const onPushRegionChange = () => applyAlertState();
    window.addEventListener("storage", onPushRegionChange);
    window.addEventListener(PUSH_REGION_EVENT, onPushRegionChange);

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeSub();
      unsubscribeDrones();
      unsubscribeTracks();
      map.off("zoomend", applyDroneState);
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
