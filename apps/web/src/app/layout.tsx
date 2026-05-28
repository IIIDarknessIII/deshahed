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
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "deshahed — карта тривог та БпЛА в Україні",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "deshahed — карта тривог та БпЛА",
    description: "Карта повітряних тривог в реальному часі.",
    images: ["/og.png"],
  },
};

const SCHEMA_ORG = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "deshahed",
  alternateName: "де-шахед",
  url: "https://xn----8sbkccc5iwa.online",
  applicationCategory: "NewsApplication",
  operatingSystem: "Any",
  inLanguage: "uk-UA",
  description:
    "Карта повітряних тривог та повідомлень про БпЛА в Україні з відкритих джерел.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "UAH" },
  author: { "@type": "Organization", name: "deshahed" },
  isAccessibleForFree: true,
  browserRequirements: "Requires JavaScript and a modern browser",
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
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_ORG) }}
        />
      </body>
    </html>
  );
}
