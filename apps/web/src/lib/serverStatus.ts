// Server-side current-alert lookup for SEO landing pages.
//
// The interactive status on these pages is driven by a client WebSocket, which
// Google never executes — so the crawler only ever saw "Завантаження…". Here we
// fetch active alerts on the server (ISR, revalidated per page) and bake the
// real current state into the HTML: H1, intro copy, <title>/description, and
// FAQ answers. This is the single biggest relevance win for "тривога X зараз".

import { subKey } from "@/lib/subregions";

export type StatusState = "air_raid" | "artillery_shelling" | "urban_fights" | "safe";

export interface RegionStatus {
  state: StatusState;
  /** ISO timestamp the alert started, when active. */
  since: string | null;
}

interface ActiveAlert {
  location_title: string;
  location_type: string;
  alert_type: string;
  started_at: string;
  location_oblast: string;
}

// Internal API host — server-to-server inside the compose network.
const API_INTERNAL = process.env.INTERNAL_API_BASE || "http://api:8000";

const SEVERITY: Record<StatusState, number> = {
  safe: 0,
  air_raid: 1,
  artillery_shelling: 2,
  urban_fights: 3,
};

function classify(alertType: string): StatusState {
  if (alertType === "urban_fights") return "urban_fights";
  if (alertType === "artillery_shelling") return "artillery_shelling";
  return "air_raid";
}

// air_raid / artillery cover broad territory, so a sub-region alert escalates
// the whole oblast; urban_fights stays local. Mirrors the map's logic.
const ESCALATES = new Set<StatusState>(["air_raid", "artillery_shelling"]);

async function fetchActive(): Promise<ActiveAlert[]> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/v1/alerts/active`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { alerts?: ActiveAlert[] };
    return data.alerts ?? [];
  } catch {
    return [];
  }
}

/** Current state for a whole oblast (oblast-level + escalated sub-region alerts). */
export async function oblastStatus(oblastFullName: string): Promise<RegionStatus> {
  const alerts = await fetchActive();
  let best: StatusState = "safe";
  let since: string | null = null;
  for (const a of alerts) {
    if ((a.location_oblast || a.location_title) !== oblastFullName) continue;
    const isOblast = a.location_type === "oblast" || a.location_type === "autonomous_republic";
    const cls = classify(a.alert_type);
    if ((isOblast || ESCALATES.has(cls)) && SEVERITY[cls] > SEVERITY[best]) {
      best = cls;
      since = a.started_at;
    }
  }
  return { state: best, since };
}

/** Current state for a single raion/hromada, matched by its normalized key. */
export async function subRegionStatus(mkey: string): Promise<RegionStatus> {
  const alerts = await fetchActive();
  let best: StatusState = "safe";
  let since: string | null = null;
  for (const a of alerts) {
    if (a.location_type !== "raion" && a.location_type !== "hromada") continue;
    if (subKey(a.location_title) !== mkey) continue;
    const cls = classify(a.alert_type);
    if (SEVERITY[cls] > SEVERITY[best]) {
      best = cls;
      since = a.started_at;
    }
  }
  return { state: best, since };
}

export const STATE_LABEL: Record<StatusState, string> = {
  air_raid: "Повітряна тривога",
  artillery_shelling: "Загроза артобстрілу",
  urban_fights: "Загроза вуличних боїв",
  safe: "Тривоги немає",
};

/** One-line human status for copy/meta, e.g. "Зараз: Повітряна тривога". */
export function statusSentence(s: RegionStatus): string {
  return s.state === "safe"
    ? "Зараз тривоги немає"
    : `Зараз: ${STATE_LABEL[s.state]}`;
}
