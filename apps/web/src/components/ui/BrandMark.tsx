import { cn } from "@/lib/cn";

/**
 * deshahed identity glyph — a radar sweep tracking a single blip (the "shahed"
 * being watched). Concentric rings in the cool accent, the tracked object in
 * alert-red. Purely decorative; the wordmark carries the accessible name.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-gradient-to-br from-surface-2 to-surface shadow-card",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <circle cx="12" cy="12" r="9" stroke="rgb(var(--accent) / 0.35)" strokeWidth="1.4" />
        <circle cx="12" cy="12" r="4.5" stroke="rgb(var(--accent) / 0.5)" strokeWidth="1.2" />
        {/* Radar sweep spoke. */}
        <path d="M12 12 L12 3" stroke="rgb(var(--accent))" strokeWidth="1.6" strokeLinecap="round" />
        {/* Tracked blip. */}
        <path d="M17 15.5 L19.6 20 L17 18.7 L14.4 20 Z" fill="rgb(var(--alert))" />
      </svg>
    </span>
  );
}
