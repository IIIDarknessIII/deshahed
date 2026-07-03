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
      className="group absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-alert/40 bg-surface/80 px-3 py-1.5 text-xs font-medium text-alert/90 shadow-float backdrop-blur transition hover:border-alert/80 hover:bg-alert/15 hover:text-alert active:scale-95"
    >
      <Heart
        size={14}
        className="fill-alert/70 text-alert transition group-hover:fill-alert"
      />
      <span>Підтримати</span>
    </a>
  );
}
