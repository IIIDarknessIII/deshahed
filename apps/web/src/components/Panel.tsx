"use client";

import { useRef, useState } from "react";
import { useUiStore, type MobileSheet } from "@/stores/uiStore";

/**
 * Shared responsive shell for the side panels.
 *
 * - Desktop (md+): a static sidebar pinned left or right.
 * - Mobile: a bottom sheet that slides up when its tab is active, with a
 *   grab handle you can swipe down to dismiss.
 *
 * The drag is done with pointer events + an inline transform (no deps). While
 * dragging we override the Tailwind transition with `transition: none` so the
 * sheet tracks the finger 1:1, then hand control back to the class-based
 * translate on release for a smooth snap/close.
 */
export function Panel({
  side,
  sheet,
  children,
}: {
  side: "left" | "right";
  sheet: Exclude<MobileSheet, null>;
  children: React.ReactNode;
}) {
  const mobileSheet = useUiStore((s) => s.mobileSheet);
  const setMobileSheet = useUiStore((s) => s.setMobileSheet);
  const open = mobileSheet === sheet;

  const [dragY, setDragY] = useState<number | null>(null);
  const startY = useRef(0);
  const dragging = dragY !== null;

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    setDragY(0);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragY === null) return;
    setDragY(Math.max(0, e.clientY - startY.current));
  };
  const endDrag = () => {
    if (dragY === null) return;
    if (dragY > 110) setMobileSheet(null);
    setDragY(null);
  };

  return (
    <aside
      style={
        dragging
          ? { transform: `translateY(${dragY}px)`, transition: "none" }
          : undefined
      }
      className={
        "flex flex-col border-border bg-bg/95 backdrop-blur transition-transform duration-300 ease-out " +
        // Desktop: static sidebar.
        "md:relative md:h-full md:w-80 md:shrink-0 md:translate-y-0 md:rounded-none md:border-x-0 md:border-t-0 md:shadow-none " +
        (side === "left" ? "md:border-r " : "md:border-l ") +
        // Mobile: rounded bottom sheet.
        "fixed inset-x-0 bottom-0 z-40 h-[82dvh] max-h-[82dvh] rounded-t-2xl border-x border-t shadow-2xl " +
        (open ? "translate-y-0" : "translate-y-full md:translate-y-0")
      }
    >
      {/* Grab handle — drag down to dismiss (mobile only). */}
      <div
        className="shrink-0 cursor-grab touch-none pb-1 pt-2.5 active:cursor-grabbing md:hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-zinc-700" />
      </div>
      {children}
    </aside>
  );
}
