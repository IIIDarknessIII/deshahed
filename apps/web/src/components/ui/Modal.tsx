"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

/**
 * Shared modal shell: dimmed backdrop, bottom-sheet on mobile / centered card on
 * desktop, mobile grab-handle, click-outside + Escape to dismiss. Content and
 * scroll behaviour are left to callers via `contentClassName`.
 */
export function Modal({
  onClose,
  children,
  size = "md",
  contentClassName,
  labelledBy,
}: {
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
  contentClassName?: string;
  labelledBy?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "animate-sheet-up flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-float md:rounded-xl",
          size === "md" ? "max-w-md" : "max-w-2xl",
          contentClassName,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab-handle affordance on mobile. */}
        <div className="shrink-0 pb-1 pt-2.5 md:hidden">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-border-strong" />
        </div>
        {children}
      </div>
    </div>
  );
}
