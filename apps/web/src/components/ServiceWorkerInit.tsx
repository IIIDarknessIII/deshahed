"use client";

import { useEffect } from "react";

export function ServiceWorkerInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Don't register during local dev — turbopack/webpack HMR doesn't play nice with cached responses.
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("SW registration failed:", err));
  }, []);
  return null;
}
