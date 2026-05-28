import { useEffect } from "react";
import { useTracksStore } from "@/stores/tracksStore";
import type { TrackWsMessage } from "@/lib/types";

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

function tracksWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8000/api/v1/ws/tracks";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return `${proto}//${host}:8000/api/v1/ws/tracks`;
  }
  return `${proto}//api.${host}/api/v1/ws/tracks`;
}

function dispatch(msg: TrackWsMessage) {
  const s = useTracksStore.getState();
  switch (msg.type) {
    case "track_snapshot":
      s.setSnapshot(msg.tracks);
      return;
    case "track_updated":
      s.upsert(msg.track);
      return;
  }
}

export function useTracksSocket() {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let backoff = RECONNECT_MIN_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(tracksWsUrl());
      ws.onopen = () => {
        useTracksStore.getState().setConnected(true);
        backoff = RECONNECT_MIN_MS;
      };
      ws.onmessage = (e) => {
        try {
          dispatch(JSON.parse(e.data) as TrackWsMessage);
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        useTracksStore.getState().setConnected(false);
        if (stopped) return;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);
}
