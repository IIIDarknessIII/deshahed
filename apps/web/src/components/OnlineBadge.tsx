"use client";

import { Users } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";
import { LiveDot } from "@/components/ui/LiveDot";

export function OnlineBadge() {
  const { data } = useOnline();
  const n = data?.online ?? 0;
  if (n <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-safe/25 bg-safe/10 px-2 py-0.5 text-[11px] font-medium text-safe"
      title="Скільки людей зараз на сайті"
    >
      <LiveDot color="safe" size={6} />
      <Users size={11} />
      <span className="font-mono tabular-nums">{n}</span>
    </span>
  );
}
