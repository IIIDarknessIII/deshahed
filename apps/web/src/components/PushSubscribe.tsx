"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { ENV } from "@/lib/env";

type State = "checking" | "unsupported" | "disabled" | "denied" | "off" | "on" | "loading";

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function fetchPublicKey(): Promise<{ public_key: string; enabled: boolean }> {
  const res = await fetch(`${ENV.apiBase}/api/v1/push/public-key`);
  if (!res.ok) throw new Error("public-key fetch failed");
  return res.json();
}

export function PushSubscribe() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      try {
        const meta = await fetchPublicKey();
        if (!meta.enabled) {
          setState("disabled");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (Notification.permission === "denied") {
          setState("denied");
          return;
        }
        setState(sub ? "on" : "off");
      } catch {
        setState("disabled");
      }
    })();
  }, []);

  const onClick = async () => {
    if (state === "off") {
      setState("loading");
      try {
        const meta = await fetchPublicKey();
        const reg = await navigator.serviceWorker.ready;
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(meta.public_key),
        });
        const body = JSON.parse(JSON.stringify(sub));
        await fetch(`${ENV.apiBase}/api/v1/push/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: body.endpoint, keys: body.keys, region_uid: null }),
        });
        setState("on");
      } catch (e) {
        console.error(e);
        setState("off");
      }
    } else if (state === "on") {
      setState("loading");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch(`${ENV.apiBase}/api/v1/push/unsubscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setState("off");
      } catch (e) {
        console.error(e);
        setState("on");
      }
    }
  };

  if (state === "checking" || state === "unsupported" || state === "disabled") return null;

  const labels: Record<State, { text: string; icon: React.ReactNode; tone: string }> = {
    checking:    { text: "—", icon: <Bell size={14} />, tone: "" },
    unsupported: { text: "—", icon: <Bell size={14} />, tone: "" },
    disabled:    { text: "—", icon: <Bell size={14} />, tone: "" },
    denied:      { text: "Сповіщення заборонені у браузері", icon: <BellOff size={14} />, tone: "text-zinc-500" },
    off:         { text: "Увімкнути сповіщення", icon: <Bell size={14} />, tone: "border-border text-zinc-300 hover:border-zinc-600" },
    loading:     { text: "Зачекайте…", icon: <Bell size={14} />, tone: "border-border text-zinc-500" },
    on:          { text: "Сповіщення увімкнені", icon: <Bell size={14} />, tone: "border-emerald-600/60 bg-emerald-600/10 text-emerald-300" },
  };
  const meta = labels[state];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "denied" || state === "loading"}
      className={
        "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition " +
        meta.tone
      }
      aria-pressed={state === "on"}
    >
      <span className="flex items-center gap-2">{meta.icon}{meta.text}</span>
      <span className="text-[10px] uppercase tracking-wide">
        {state === "on" ? "увімк." : state === "denied" ? "block" : "вимк."}
      </span>
    </button>
  );
}
