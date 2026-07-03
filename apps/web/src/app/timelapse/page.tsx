import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { Timelapse } from "@/components/Timelapse";

export const metadata: Metadata = {
  title: "Тайм-лапс тривог за добу",
  description:
    "Анімація повітряних тривог в Україні за останні 24 години — перемотайте ніч хвилину за хвилиною.",
  alternates: { canonical: "https://xn----8sbkccc5iwa.online/timelapse" },
  openGraph: {
    title: "deshahed — тайм-лапс тривог за добу",
    description: "24 години повітряних тривог в Україні за хвилину перегляду.",
    url: "https://xn----8sbkccc5iwa.online/timelapse",
    siteName: "deshahed",
    locale: "uk_UA",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "deshahed — тайм-лапс" }],
  },
};

export default function TimelapsePage() {
  return (
    <main className="flex h-dvh w-screen flex-col overflow-hidden bg-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,var(--safe-top))]">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
          aria-label="До карти"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-fg">
            Тайм-лапс тривог за 24 години
          </div>
          <div className="text-xs text-fg-subtle">
            Перемотайте ніч хвилину за хвилиною
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <Timelapse />
      </div>
    </main>
  );
}
