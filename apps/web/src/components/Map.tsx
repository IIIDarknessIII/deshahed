"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { useAlertsStore, selectActiveTitles } from "@/stores/alertsStore";

const SOURCE_ID = "oblasts";
const FILL_LAYER = "oblasts-fill";
const LINE_LAYER = "oblasts-line";

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
            "active",
            "#ef4444",
            "recent",
            "#f59e0b",
            "#1f2937",
          ],
          "fill-opacity": [
            "match",
            ["get", "state"],
            "active",
            0.45,
            "recent",
            0.35,
            0.55,
          ],
        },
      });

      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#27272a",
          "line-width": 1,
        },
      });

      // Initial paint from current store state.
      applyAlertState();
    });

    const applyAlertState = () => {
      const geo = geojsonRef.current;
      if (!geo || !mapRef.current) return;
      const titles = selectActiveTitles(useAlertsStore.getState());
      let changed = false;
      for (const f of geo.features) {
        const title = (f.properties as { full_name_uk?: string } | null)?.full_name_uk;
        const next = title && titles.has(title) ? "active" : "safe";
        if ((f.properties as { state?: string } | null)?.state !== next) {
          (f.properties as Record<string, unknown>).state = next;
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

    const unsubscribe = useAlertsStore.subscribe(applyAlertState);

    return () => {
      cancelled = true;
      unsubscribe();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
