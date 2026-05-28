"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, ChevronDown } from "lucide-react";
import { ENV } from "@/lib/env";
import { REGIONS } from "@/lib/regions";

type State = "checking" | "unsupported" | "disabled" | "denied" | "off" | "on" | "loading";

const ALL_UA = "__all__"; // sentinel; null on the wire

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

function loadSavedRegion(): string {
  if (typeof window === "undefined") return ALL_UA;
  return localStorage.getItem("deshahed.pushRegion") || ALL_UA;
}

function saveRegion(value: string) {
  if (typeof window === "undefined") return;
  if (value === ALL_UA) localStorage.removeItem("deshahed.pushRegion");
  else localStorage.setItem("deshahed.pushRegion", value);
  // Map.tsx listens for this to repaint the oblast border without reload.
  window.dispatchEvent(new CustomEvent("deshahed:pushRegionChange"));
}

export function PushSubscribe() {
  const [state, setState] = useState<State>("checking");
  const [region, setRegion] = useState<string>(loadSavedRegion);

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

  const subscribeNow = async (chosen: string) => {
    setState("loading");
    try {
      const meta = await fetchPublicKey();
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      // Reuse existing endpoint if any — otherwise create a new one.
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(meta.public_key),
        });
      }
      const body = JSON.parse(JSON.stringify(sub));
      await fetch(`${ENV.apiBase}/api/v1/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: body.endpoint,
          keys: body.keys,
          region_oblast: chosen === ALL_UA ? null : chosen,
        }),
      });
      saveRegion(chosen);
      setState("on");
    } catch (e) {
      console.error(e);
      setState("off");
    }
  };

  const unsubscribeNow = async () => {
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
  };

  const onRegionChange = async (val: string) => {
    setRegion(val);
    saveRegion(val);
    // Live re-subscribe if already subscribed — same browser endpoint, new
    // region on the server. No permission re-prompt.
    if (state === "on") await subscribeNow(val);
  };

  if (state === "checking" || state === "unsupported" || state === "disabled") return null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <select
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-border bg-bg/60 px-3 py-2 pr-8 text-sm text-zinc-100"
        >
          <option value={ALL_UA}>Уся Україна</option>
          {REGIONS.map((r) => (
            <option key={r.full_name_uk} value={r.full_name_uk}>{r.full_name_uk}</option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500" />
      </div>

      {state === "denied" ? (
        <div className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-zinc-500">
          <BellOff size={14} /> Сповіщення заборонені у налаштуваннях браузера
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (state === "on" ? unsubscribeNow() : subscribeNow(region))}
          disabled={state === "loading"}
          className={
            "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition " +
            (state === "on"
              ? "border-emerald-600/60 bg-emerald-600/10 text-emerald-300"
              : "border-border text-zinc-300 hover:border-zinc-600")
          }
          aria-pressed={state === "on"}
        >
          <span className="flex items-center gap-2">
            <Bell size={14} />
            {state === "loading"
              ? "Зачекайте…"
              : state === "on"
                ? "Сповіщення увімкнені"
                : "Увімкнути сповіщення"}
          </span>
          <span className="text-[10px] uppercase tracking-wide">
            {state === "on" ? "увімк." : "вимк."}
          </span>
        </button>
      )}
    </div>
  );
}
