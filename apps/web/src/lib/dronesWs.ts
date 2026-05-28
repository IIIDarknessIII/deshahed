import { useEffect } from "react";
import { useDronesStore } from "@/stores/dronesStore";
import type { DroneWsMessage } from "@/lib/types";

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const EVICT_INTERVAL_MS = 5_000;

function dronesWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8000/api/v1/ws/drones";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return `${proto}//${host}:8000/api/v1/ws/drones`;
  }
  return `${proto}//api.${host}/api/v1/ws/drones`;
}

function dispatch(msg: DroneWsMessage) {
  const s = useDronesStore.getState();
  switch (msg.type) {
    case "drone_snapshot":
      s.setSnapshot(msg.drones);
      return;
    case "drone_appeared":
      s.upsert(msg.drone);
      return;
  }
}

export function useDronesSocket() {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let backoff = RECONNECT_MIN_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const evict = setInterval(() => useDronesStore.getState().evictExpired(), EVICT_INTERVAL_MS);

    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(dronesWsUrl());
      ws.onopen = () => {
        useDronesStore.getState().setConnected(true);
        backoff = RECONNECT_MIN_MS;
      };
      ws.onmessage = (e) => {
        try {
          dispatch(JSON.parse(e.data) as DroneWsMessage);
        } catch {
          // ignore malformed
        }
      };
      ws.onclose = () => {
        useDronesStore.getState().setConnected(false);
        if (stopped) return;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      stopped = true;
      clearInterval(evict);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);
}
