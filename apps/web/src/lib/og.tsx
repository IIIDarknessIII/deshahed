import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };

type FontDef = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };
let fontsCache: FontDef[] | null = null;

// Noto Sans ships with this repo (apps/web/assets) — the default next/og font
// has no Cyrillic, so Ukrainian text would render as tofu without it.
async function loadFonts(): Promise<FontDef[]> {
  if (fontsCache) return fontsCache;
  const dir = join(process.cwd(), "assets");
  const [regular, bold] = await Promise.all([
    readFile(join(dir, "NotoSans-Regular.ttf")),
    readFile(join(dir, "NotoSans-Bold.ttf")),
  ]);
  fontsCache = [
    { name: "Noto Sans", data: regular, weight: 400, style: "normal" },
    { name: "Noto Sans", data: bold, weight: 700, style: "normal" },
  ];
  return fontsCache;
}

/** Branded 1200×630 OG card with the region name. */
export async function renderOg({
  title,
  subtitle,
  accent = "#ef4444",
}: {
  title: string;
  subtitle: string;
  accent?: string;
}) {
  const fonts = await loadFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0b",
          color: "#e5e7eb",
          padding: "64px 72px",
          fontFamily: "Noto Sans",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 20, height: 20, borderRadius: 9999, background: accent }} />
          <div style={{ fontSize: 30, fontWeight: 700, color: "#fafafa" }}>deshahed</div>
          <div style={{ fontSize: 24, color: "#71717a" }}>· карта повітряних тривог</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 66, fontWeight: 700, color: "#fafafa", lineHeight: 1.05 }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 34, color: "#a1a1aa" }}>{subtitle}</div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, color: "#52525b" }}>Повітряні тривоги в реальному часі</div>
          <div style={{ fontSize: 26, color: "#a1a1aa" }}>deshahed.online</div>
        </div>
      </div>
    ),
    {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
    },
  );
}
