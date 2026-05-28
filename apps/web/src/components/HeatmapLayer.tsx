"use client";

import { useEffect } from "react";
import { useHeatmap } from "@/hooks/useHeatmap";
import { useUiStore } from "@/stores/uiStore";

/**
 * Pure side-effect component — owns no markup. It keeps the global
 * `heatmap-source` / `heatmap-fill` MapLibre layer in sync with the
 * uiStore toggle and the latest /api/v1/heatmap response. Map.tsx
 * pre-installs the empty source+layer at startup so this component
 * just patches the data + paint expression.
 */
export function HeatmapController({
  setData,
  setVisibility,
  setMaxWeight,
}: {
  setData: (fc: GeoJSON.FeatureCollection) => void;
  setVisibility: (visible: boolean) => void;
  setMaxWeight: (n: number) => void;
}) {
  const on = useUiStore((s) => s.heatmapOn);
  const period = useUiStore((s) => s.heatmapPeriod);
  const { data } = useHeatmap(period, "all", on);

  useEffect(() => {
    setVisibility(on);
  }, [on, setVisibility]);

  useEffect(() => {
    if (!data) return;
    setData(data.geojson);
    setMaxWeight(data.max_weight);
  }, [data, setData, setMaxWeight]);

  return null;
}
