import Link from "next/link";
import { topSubRegions } from "@/lib/serverStatus";

/**
 * "Hotspots" — the most-active raions/hromadas over the last 30 days, as an
 * internal-link cloud. Server-rendered so the links sit in the HTML; fail-soft
 * to nothing if the API is unavailable. Placed on high-authority hubs to steer
 * crawl budget toward the sub-region pages that actually have search demand.
 */
export async function Hotspots({
  limit = 24,
  heading = "Найактивніші райони та громади",
  className = "",
}: {
  limit?: number;
  heading?: string;
  className?: string;
}) {
  const items = await topSubRegions(limit);
  if (items.length === 0) return null;

  return (
    <section className={className}>
      <h2 className="mb-3 text-sm font-semibold text-fg">
        {heading}{" "}
        <span className="font-normal text-fg-subtle">· 30 днів</span>
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.map((h) => (
          <Link
            key={`${h.type}-${h.slug}`}
            href={`/${h.type}/${h.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/50 px-3 py-1 text-[13px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
            title={`${h.name}, ${h.oblast} — ${h.count} тривог за 30 днів`}
          >
            {h.name}
            <span className="font-mono text-[11px] tabular-nums text-alert/90">
              {h.count}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
