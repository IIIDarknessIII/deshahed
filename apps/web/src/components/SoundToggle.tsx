"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  soundEnabled,
  setSoundEnabled,
  unlockAudio,
  subscribedOblast,
} from "@/lib/sound";
import { ToggleRow } from "@/components/ui/ToggleRow";

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
    <ToggleRow
      icon={on ? <Volume2 size={15} /> : <VolumeX size={15} />}
      label={on ? "Сирена увімкнена" : "Увімкнути сирену"}
      active={on}
      accent="warn"
      onClick={toggle}
      disabled={!hasRegion}
      title={
        hasRegion
          ? "Звукова сирена та озвучка для підписаної області"
          : "Спочатку оберіть область вище"
      }
    />
  );
}
