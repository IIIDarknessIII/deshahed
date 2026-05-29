"use client";

import { Users } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";

export function OnlineBadge() {
  const { data } = useOnline();
  const n = data?.online ?? 0;
  if (n <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300"
      title="Скільки людей зараз на сайті"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      <Users size={11} />
      <span className="tabular-nums">{n}</span>
    </span>
  );
}
