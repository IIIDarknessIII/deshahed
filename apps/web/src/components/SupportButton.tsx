"use client";

import { Heart } from "lucide-react";
import { SUPPORT_URL } from "@/lib/links";

/**
 * Subtle floating "support" pill, pinned to the map's top-left corner.
 * Always visible but small and translucent so it never covers the data the
 * user came for. Opens the monobank donation jar in a new tab.
 */
export function SupportButton() {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Підтримати проєкт"
      className="group absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-bg/80 px-3 py-1.5 text-xs font-medium text-rose-200 shadow-lg backdrop-blur transition hover:border-rose-400/80 hover:bg-rose-500/15 active:scale-95"
    >
      <Heart
        size={14}
        className="fill-rose-500/70 text-rose-400 transition group-hover:fill-rose-400"
      />
      <span>Підтримати</span>
    </a>
  );
}
