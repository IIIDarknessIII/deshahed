import { useEffect } from "react";
import { useAlertsStore } from "@/stores/alertsStore";
import { ENV } from "@/lib/env";
import { notifyAlertStarted } from "@/lib/sound";
import type { WsMessage } from "@/lib/types";

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

function dispatch(msg: WsMessage) {
  const s = useAlertsStore.getState();
  switch (msg.type) {
    case "snapshot":
      s.setSnapshot(msg.alerts);
      return;
    case "alert_started":
      s.upsert(msg.alert);
      notifyAlertStarted(msg.alert.location_oblast || msg.alert.location_title);
      return;
    case "alert_ended":
      s.remove(msg.location_uid, msg.alert_type);
      return;
  }
}

export function useAlertsSocket() {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let backoff = RECONNECT_MIN_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(ENV.wsUrl);

      ws.onopen = () => {
        useAlertsStore.getState().setConnected(true);
        backoff = RECONNECT_MIN_MS;
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as WsMessage;
          dispatch(data);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        useAlertsStore.getState().setConnected(false);
        if (stopped) return;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);
}
