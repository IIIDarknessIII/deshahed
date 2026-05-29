"use client";

import { useEffect, useState } from "react";
import { Download, Share2, Smartphone, X } from "lucide-react";

// `beforeinstallprompt` is non-standard and missing from lib.dom.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "deshahed.installDismissed";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // re-offer after a week

function recentlyDismissed(): boolean {
  const v = localStorage.getItem(DISMISS_KEY);
  const ts = v ? Number(v) : NaN;
  return Number.isFinite(ts) && Date.now() - ts < DISMISS_MS;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari home-screen apps
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !("MSStream" in window)
  );
}

/**
 * Bottom banner that invites phone users to install the PWA.
 *
 * - Chromium (Android/desktop Chrome): captures `beforeinstallprompt` and
 *   triggers the native install flow on tap.
 * - iOS Safari: no programmatic install exists, so we show the manual
 *   "Share → Add to Home Screen" hint instead.
 *
 * Mobile-only (`md:hidden`); desktop users get the static note in StatsPanel.
 * Dismissals are remembered for a week.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    if (isIos()) {
      setIos(true);
      setShow(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="relative z-20 shrink-0 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-100">
          <Smartphone size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-100">
            Встановити застосунок
          </div>
          {ios ? (
            <div className="text-[11px] leading-snug text-zinc-400">
              Натисніть <Share2 size={11} className="-mt-0.5 inline" /> унизу та
              «На екран “Домівка”»
            </div>
          ) : (
            <div className="text-[11px] text-zinc-400">
              Швидкий доступ до карти просто з екрана телефону
            </div>
          )}
        </div>
        {!ios && (
          <button
            type="button"
            onClick={install}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 active:scale-95"
          >
            <Download size={15} />
            Встановити
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Сховати"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
