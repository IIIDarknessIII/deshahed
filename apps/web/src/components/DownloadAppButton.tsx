"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari home-screen apps
    (window.navigator as { standalone?: boolean }).standalone === true ||
    // TWA launches with this referrer
    document.referrer.startsWith("android-app://")
  );
}

/**
 * Floating "download Android app" pill, pinned to the map's bottom-right —
 * mirrors SupportButton (bottom-left) so the two sit opposite each other.
 * Hidden when already running inside the installed app (TWA/standalone PWA):
 * a user who's in the app obviously doesn't need to download it.
 */
export function DownloadAppButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!isStandalone());
  }, []);

  if (!show) return null;

  return (
    <a
      href="/deshahed.apk"
      download
      title="Завантажити застосунок для Android"
      className="group absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-bg/80 px-3 py-1.5 text-xs font-medium text-emerald-200 shadow-lg backdrop-blur transition hover:border-emerald-400/80 hover:bg-emerald-500/15 active:scale-95"
    >
      <Download size={14} className="text-emerald-400 transition group-hover:text-emerald-300" />
      <span>Android-застосунок</span>
    </a>
  );
}
