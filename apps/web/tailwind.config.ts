import type { Config } from "tailwindcss";

/**
 * deshahed design tokens.
 *
 * Colours are declared as space-separated RGB channels in globals.css (`:root`)
 * and referenced here through `rgb(var(--token) / <alpha-value>)`. That keeps a
 * single source of truth shared between Tailwind utilities (`bg-surface`,
 * `text-fg-muted/70`, …) and the raw CSS we hand-write for MapLibre controls,
 * scrollbars and popups.
 *
 * The palette preserves deshahed's near-black "tactical" identity but layers it:
 * a deepest map letterbox, a panel surface, and raised cards, each a hair cooler
 * and lighter than the last so depth reads without a single hard border.
 */
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Layered neutral-cool dark surfaces (deepest → most raised).
        bg: rgb("--bg"),
        surface: rgb("--surface"),
        "surface-2": rgb("--surface-2"),
        "surface-3": rgb("--surface-3"),

        // Borders / hairlines.
        border: rgb("--border"),
        "border-strong": rgb("--border-strong"),

        // Text ramp — all AA-compliant on `surface` at their intended sizes.
        fg: rgb("--fg"),
        "fg-muted": rgb("--fg-muted"),
        "fg-subtle": rgb("--fg-subtle"),
        "fg-faint": rgb("--fg-faint"),

        // Interactive accent (cool "night" signal) — links, focus, selection.
        accent: rgb("--accent"),

        // Alert-state semantics (mirror the on-map palette exactly).
        alert: rgb("--alert"), // active air raid
        "alert-active": rgb("--alert"), // back-compat alias
        warn: rgb("--warn"), // recently ended / caution
        "alert-recent": rgb("--warn"), // back-compat alias
        artillery: rgb("--artillery"),
        street: rgb("--street"),
        safe: rgb("--safe"),

        // Object-type accents (drones / munitions on the map).
        shahed: rgb("--shahed"),
        recon: rgb("--recon"),
        missile: rgb("--missile"),
        kab: rgb("--kab"),
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Apple Color Emoji",
          "Segoe UI Emoji",
        ],
        // "The numbers are the hero" — timers, counts, coordinates read in a
        // tabular monospace. System-hosted, so zero network cost on a live site.
        mono: [
          "ui-monospace",
          "SF Mono",
          "SFMono-Regular",
          "JetBrains Mono",
          "Cascadia Code",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        // Dark-surface depth: soft ambient drop + a faint top highlight so
        // raised elements catch "light" instead of just floating on shadow.
        panel: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 8px 30px -12px rgb(0 0 0 / 0.7)",
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 2px 12px -6px rgb(0 0 0 / 0.6)",
        float: "0 1px 0 0 rgb(255 255 255 / 0.05) inset, 0 10px 40px -8px rgb(0 0 0 / 0.75)",
      },
      keyframes: {
        "pulse-live": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.82)" },
        },
        "pulse-ring": {
          "0%": { opacity: "0.5", transform: "scale(1)" },
          "70%, 100%": { opacity: "0", transform: "scale(2.4)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-live": "pulse-live 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fade-in 240ms cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
