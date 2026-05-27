import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        "alert-active": "#ef4444",
        "alert-recent": "#f59e0b",
        safe: "#1f2937",
        border: "#27272a",
      },
    },
  },
  plugins: [],
};

export default config;
