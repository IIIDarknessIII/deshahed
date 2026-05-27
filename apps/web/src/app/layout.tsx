import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";

export const metadata: Metadata = {
  title: "deshahed — карта тривог та БпЛА",
  description:
    "Карта повітряних тривог та повідомлень про БпЛА в Україні з відкритих джерел. Дані з alerts.in.ua та OSINT.",
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
      </body>
    </html>
  );
}
