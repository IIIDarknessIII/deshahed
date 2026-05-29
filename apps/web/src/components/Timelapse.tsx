"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { Pause, Play, SkipBack } from "lucide-react";
import { ENV } from "@/lib/env";

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {},
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#0a0a0b" } },
  ],
};

interface TimelapseFrame {
  t: string;
  oblasts: Record<string, string>;
}
interface TimelapseResponse {
  started_at: string;
  ended_at: string;
  step_seconds: number;
  frames: TimelapseFrame[];
}

const STATE_LABEL_UK: Record<string, string> = {
  air_raid: "Повітряна тривога",
  artillery_shelling: "Загроза артобстрілу",
  urban_fights: "Загроза вуличних боїв",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

export function Timelapse() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const geoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const [data, setData] = useState<TimelapseResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4 | 8>(2);

  useEffect(() => {
    (async () => {
      const r = await fetch(`${ENV.apiBase}/api/v1/stats/timelapse?hours=24&step_seconds=300`);
      if (!r.ok) return;
      const j = (await r.json()) as TimelapseResponse;
      setData(j);
      setIdx(Math.max(0, j.frames.length - 1));
    })();
  }, []);

  // Set up the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [31.2, 49.0],
      zoom: 4.7,
      attributionControl: false,
      maxZoom: 9,
      minZoom: 4,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.on("load", async () => {
      const resp = await fetch("/geo/oblasts.geojson");
      const geo = (await resp.json()) as GeoJSON.FeatureCollection;
      for (const f of geo.features) f.properties = { ...f.properties, state: "safe" };
      geoRef.current = geo;
      map.addSource("oblasts", { type: "geojson", data: geo });
      map.addLayer({
        id: "oblasts-fill",
        type: "fill",
        source: "oblasts",
        paint: {
          "fill-color": [
            "match", ["get", "state"],
            "urban_fights", "#a855f7",
            "artillery_shelling", "#f97316",
            "air_raid", "#ef4444",
            "#1f2937",
          ],
          "fill-opacity": [
            "match", ["get", "state"],
            "urban_fights", 0.55,
            "artillery_shelling", 0.5,
            "air_raid", 0.45,
            0.5,
          ],
        },
      });
      map.addLayer({
        id: "oblasts-line",
        type: "line",
        source: "oblasts",
        paint: { "line-color": "#27272a", "line-width": 1 },
      });
      map.addLayer({
        id: "oblasts-label",
        type: "symbol",
        source: "oblasts",
        layout: {
          "text-field": ["get", "name_uk"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 9, 6, 11, 8, 13],
          "text-anchor": "center",
          "text-allow-overlap": false,
          "text-padding": 3,
        },
        paint: {
          "text-color": "#e4e4e7",
          "text-halo-color": "#0a0a0b",
          "text-halo-width": 1.4,
        },
      });
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Paint current frame's oblasts onto the map.
  useEffect(() => {
    const map = mapRef.current;
    const geo = geoRef.current;
    if (!map || !geo || !data) return;
    const oblasts = data.frames[idx]?.oblasts ?? {};
    let changed = false;
    for (const f of geo.features) {
      const title = (f.properties as { full_name_uk?: string } | null)?.full_name_uk;
      const next = (title && oblasts[title]) || "safe";
      const cur = (f.properties as { state?: string } | null)?.state;
      if (cur !== next) {
        (f.properties as Record<string, unknown>).state = next;
        changed = true;
      }
    }
    if (changed) {
      (map.getSource("oblasts") as maplibregl.GeoJSONSource | undefined)?.setData(geo);
    }
  }, [idx, data]);

  // Playback loop.
  useEffect(() => {
    if (!playing || !data) return;
    const intervalMs = 1000 / speed; // 1 frame per "second" at 1×; faster at 2×/4×
    const id = setInterval(() => {
      setIdx((i) => {
        if (!data) return i;
        const next = i + 1;
        if (next >= data.frames.length) {
          setPlaying(false);
          return i;
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [playing, speed, data]);

  const activeCount = useMemo(() => {
    if (!data) return 0;
    return Object.keys(data.frames[idx]?.oblasts ?? {}).length;
  }, [data, idx]);

  const currentTime = data?.frames[idx]?.t ?? data?.started_at ?? "";

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-bg/85 px-3 py-1.5 backdrop-blur">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Час</div>
          <div className="font-mono text-base font-semibold text-zinc-100 tabular-nums">
            {currentTime ? formatTime(currentTime) : "—"}
          </div>
          <div className="text-[11px] text-zinc-400">
            Активних областей: <span className="tabular-nums text-zinc-100">{activeCount}</span>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-bg/95 px-3 py-3 backdrop-blur">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setIdx(0); setPlaying(false); }}
            className="rounded p-1.5 text-zinc-300 hover:bg-zinc-800"
            aria-label="На початок"
            title="На початок"
          >
            <SkipBack size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!data) return;
              if (idx >= data.frames.length - 1) setIdx(0);
              setPlaying((p) => !p);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/20"
            disabled={!data}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? "Пауза" : "Грати"}
          </button>
          <div className="ml-2 flex items-center gap-1 text-xs text-zinc-400">
            <span>Швидкість:</span>
            {[1, 2, 4, 8].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s as 1 | 2 | 4 | 8)}
                className={
                  "rounded px-1.5 py-0.5 tabular-nums " +
                  (speed === s
                    ? "bg-zinc-100 text-zinc-900"
                    : "border border-border hover:border-zinc-600")
                }
              >
                {s}×
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-zinc-500 tabular-nums">
            {data ? `${idx + 1}/${data.frames.length}` : "—"}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={data ? data.frames.length - 1 : 0}
          step={1}
          value={idx}
          onChange={(e) => { setIdx(Number(e.target.value)); setPlaying(false); }}
          className="h-1.5 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-amber-500"
          disabled={!data}
        />
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-400">
          {Object.entries(STATE_LABEL_UK).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className={
                  "inline-block h-2.5 w-2.5 rounded-sm " +
                  (k === "air_raid" ? "bg-red-500/60" :
                   k === "artillery_shelling" ? "bg-orange-500/60" : "bg-purple-500/70")
                }
              />
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
