import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "deshahed — карта тривог та БпЛА",
    short_name: "deshahed",
    description:
      "Карта повітряних тривог та повідомлень про БпЛА в Україні з відкритих джерел.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    lang: "uk",
    categories: ["news", "utilities", "navigation"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
