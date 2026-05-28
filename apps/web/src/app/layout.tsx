import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { ServiceWorkerInit } from "@/components/ServiceWorkerInit";

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://xn----8sbkccc5iwa.online"),
  title: {
    default: "deshahed — карта тривог та БпЛА в Україні",
    template: "%s · deshahed",
  },
  description:
    "Карта повітряних тривог та повідомлень про БпЛА в Україні з відкритих джерел. Дані з alerts.in.ua та OSINT-моніторингу.",
  applicationName: "deshahed",
  keywords: [
    "повітряна тривога",
    "Україна",
    "карта тривог",
    "БпЛА",
    "шахед",
    "OSINT",
    "alerts.in.ua",
  ],
  openGraph: {
    title: "deshahed — карта тривог та БпЛА в Україні",
    description: "Карта повітряних тривог в реальному часі.",
    url: "https://xn----8sbkccc5iwa.online",
    siteName: "deshahed",
    locale: "uk_UA",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "deshahed — карта тривог та БпЛА",
    description: "Карта повітряних тривог в реальному часі.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <body>
        <QueryProvider>{children}</QueryProvider>
        <ServiceWorkerInit />
      </body>
    </html>
  );
}
