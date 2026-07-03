"use client";

import { useEffect, useState } from "react";
import { ENV } from "@/lib/env";
import type { AlertType, AlertView, LocationType, OblastAlertState } from "@/lib/types";
import { ALERT_TYPE_LABEL_UK } from "@/lib/labels";

const SEV: Record<OblastAlertState, number> = {
  safe: 0,
  air_raid: 1,
  artillery_shelling: 2,
  urban_fights: 3,
};
const ESC: ReadonlySet<OblastAlertState> = new Set(["air_raid", "artillery_shelling"]);

const COLOR: Record<OblastAlertState, { bg: string; text: string; dot: string; border: string }> = {
  safe:            { bg: "bg-surface",     text: "text-fg-muted",  dot: "bg-fg-faint",   border: "border-border" },
  air_raid:        { bg: "bg-alert/10",     text: "text-alert",     dot: "bg-alert",      border: "border-alert/40" },
  artillery_shelling: { bg: "bg-artillery/10", text: "text-artillery", dot: "bg-artillery", border: "border-artillery/40" },
  urban_fights:    { bg: "bg-street/10",    text: "text-street",    dot: "bg-street",     border: "border-street/40" },
};

function classify(t: AlertType): OblastAlertState {
  if (t === "urban_fights") return "urban_fights";
  if (t === "artillery_shelling") return "artillery_shelling";
  return "air_raid";
}

function isOblastLevel(lt: LocationType): boolean {
  return lt === "oblast" || lt === "autonomous_republic";
}

interface Derived {
  state: OblastAlertState;
  type: AlertType | null;
  since: Date | null;
}

function derive(alerts: AlertView[]): Derived {
  let state: OblastAlertState = "safe";
  let type: AlertType | null = null;
  let since: Date | null = null;
  for (const a of alerts) {
    const cls = classify(a.alert_type);
    const escalates = isOblastLevel(a.location_type) || ESC.has(cls);
    if (!escalates) continue;
    if (SEV[cls] > SEV[state]) {
      state = cls;
      type = a.alert_type;
      since = new Date(a.started_at);
    }
  }
  return { state, type, since };
}

function durationLabel(d: Date | null): string {
  if (!d) return "";
  const ms = Date.now() - d.getTime();
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} год ${m} хв` : `${h} год`;
}

export function EmbedStatus({
  uid,
  oblastTitle,
  slug,
}: {
  uid: number;
  oblastTitle: string;
  slug: string;
}) {
  const [derived, setDerived] = useState<Derived>({ state: "safe", type: null, since: null });
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const r = await fetch(`${ENV.apiBase}/api/v1/alerts/location/${uid}/active`);
        if (!r.ok) return;
        const j = (await r.json()) as { alerts: AlertView[] };
        if (cancelled) return;
        setDerived(derive(j.alerts));
      } catch {
        /* ignore — keep last value */
      }
    };

    load();
    const fetchTimer = setInterval(load, 15_000);
    // re-render every 60s so the duration label ticks even between fetches
    const tickTimer = setInterval(() => force((n) => n + 1), 60_000);
    return () => {
      cancelled = true;
      clearInterval(fetchTimer);
      clearInterval(tickTimer);
    };
  }, [uid]);

  const c = COLOR[derived.state];
  const label = derived.type ? ALERT_TYPE_LABEL_UK[derived.type] : "Немає інформації про тривогу";

  return (
    <a
      href={`https://xn----8sbkccc5iwa.online/region/${slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex h-full w-full flex-col items-stretch justify-between rounded-lg border ${c.bg} ${c.border} px-3 py-2 text-left no-underline transition`}
      style={{ minHeight: 0 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate text-[12px] font-semibold uppercase tracking-wide ${c.text}`}>
          {oblastTitle}
        </span>
        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.dot} animate-pulse`} />
      </div>
      <div className={`mt-1 truncate text-[14px] font-semibold ${c.text}`}>{label}</div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="truncate text-fg-muted tabular-nums">{durationLabel(derived.since)}</span>
        <span className="text-fg-subtle">deshahed.online</span>
      </div>
    </a>
  );
}
