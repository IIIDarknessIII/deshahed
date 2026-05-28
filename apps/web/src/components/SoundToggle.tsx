"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  soundEnabled,
  setSoundEnabled,
  unlockAudio,
  subscribedOblast,
} from "@/lib/sound";

export function SoundToggle() {
  const [on, setOn] = useState(false);
  const [hasRegion, setHasRegion] = useState(false);

  useEffect(() => {
    setOn(soundEnabled());
    setHasRegion(!!subscribedOblast());
    const onRegion = () => setHasRegion(!!subscribedOblast());
    const onSound = () => setOn(soundEnabled());
    window.addEventListener("deshahed:pushRegionChange", onRegion);
    window.addEventListener("deshahed:soundChange", onSound);
    window.addEventListener("storage", onRegion);
    return () => {
      window.removeEventListener("deshahed:pushRegionChange", onRegion);
      window.removeEventListener("deshahed:soundChange", onSound);
      window.removeEventListener("storage", onRegion);
    };
  }, []);

  const toggle = async () => {
    if (!on) await unlockAudio();
    setSoundEnabled(!on);
    setOn(!on);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!hasRegion}
      title={
        hasRegion
          ? "Звукова сирена та озвучка для підписаної області"
          : "Спочатку оберіть область вище"
      }
      className={
        "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition " +
        (on
          ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
          : "border-border text-zinc-300 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50")
      }
      aria-pressed={on}
    >
      <span className="flex items-center gap-2">
        {on ? <Volume2 size={14} /> : <VolumeX size={14} />}
        {on ? "Сирена увімкнена" : "Увімкнути сирену"}
      </span>
      <span className="text-[10px] uppercase tracking-wide">
        {on ? "увімк." : "вимк."}
      </span>
    </button>
  );
}
