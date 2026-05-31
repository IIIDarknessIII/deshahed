import type { DroneEventType } from "@/lib/types";

// Larger vector illustrations (vs the tiny map icons) for the detail modal.
// No third-party imagery, no licensing concerns.
export function ObjectIllustration({ type }: { type: DroneEventType | string }) {
  const common = { className: "h-full w-full", viewBox: "0 0 120 80" } as const;
  switch (type) {
    case "missile":
      return (
        <svg {...common} aria-hidden>
          <rect width="120" height="80" fill="#1c1917" />
          <g transform="translate(8,34)">
            <path d="M0 6 H78 Q96 6 104 10 Q96 14 78 14 H0 Z" fill="#dc2626" stroke="#0a0a0b" strokeWidth="1.5" />
            <path d="M22 6 L34 -8 L40 6 Z" fill="#b91c1c" stroke="#0a0a0b" strokeWidth="1.2" />
            <path d="M22 14 L34 28 L40 14 Z" fill="#b91c1c" stroke="#0a0a0b" strokeWidth="1.2" />
            <path d="M0 6 L-12 0 L-8 10 L-14 14 L0 14 Z" fill="#fde047" stroke="#0a0a0b" strokeWidth="1" />
          </g>
        </svg>
      );
    case "kab":
      return (
        <svg {...common} aria-hidden>
          <rect width="120" height="80" fill="#1c1917" />
          <g transform="translate(16,30)">
            <ellipse cx="44" cy="12" rx="44" ry="11" fill="#a855f7" stroke="#0a0a0b" strokeWidth="1.5" />
            <rect x="60" y="-6" width="6" height="36" rx="2" fill="#7e22ce" stroke="#0a0a0b" strokeWidth="1" />
            <rect x="74" y="-2" width="5" height="28" rx="2" fill="#7e22ce" stroke="#0a0a0b" strokeWidth="1" />
            <path d="M0 12 L-10 6 L-10 18 Z" fill="#7e22ce" stroke="#0a0a0b" strokeWidth="1" />
          </g>
        </svg>
      );
    case "aviation":
      return (
        <svg {...common} aria-hidden>
          <rect width="120" height="80" fill="#1c1917" />
          <g transform="translate(60,40)">
            <path d="M-44 0 Q-30 -4 36 -3 L48 0 L36 3 Q-30 4 -44 0 Z" fill="#38bdf8" stroke="#0a0a0b" strokeWidth="1.5" />
            <path d="M-6 -2 L-30 -26 L-14 -2 Z" fill="#0ea5e9" stroke="#0a0a0b" strokeWidth="1.2" />
            <path d="M-6 2 L-30 26 L-14 2 Z" fill="#0ea5e9" stroke="#0a0a0b" strokeWidth="1.2" />
            <path d="M30 -2 L40 -12 L36 -2 Z" fill="#0ea5e9" stroke="#0a0a0b" strokeWidth="1.2" />
          </g>
        </svg>
      );
    case "shahed":
    default:
      return (
        <svg {...common} aria-hidden>
          <rect width="120" height="80" fill="#1c1917" />
          <g transform="translate(60,40)">
            {/* delta wing, nose to the right */}
            <path d="M-34 0 L30 0 L18 -22 Z" fill="#fb923c" stroke="#0a0a0b" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M-34 0 L30 0 L18 22 Z" fill="#f97316" stroke="#0a0a0b" strokeWidth="1.5" strokeLinejoin="round" />
            <rect x="22" y="-3" width="20" height="6" rx="3" fill="#fb923c" stroke="#0a0a0b" strokeWidth="1.2" />
            <circle cx="30" cy="0" r="3" fill="#fde047" stroke="#0a0a0b" strokeWidth="0.8" />
            <rect x="-40" y="-7" width="8" height="14" rx="2" fill="#ea580c" stroke="#0a0a0b" strokeWidth="1" />
          </g>
        </svg>
      );
  }
}
