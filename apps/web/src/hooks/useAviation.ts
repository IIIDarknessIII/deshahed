import { useQuery } from "@tanstack/react-query";
import { ENV } from "@/lib/env";

export type CraftType = "mig31k" | "tu95" | "tu160" | "tu22m3";
export type AviationStatus = "in_air" | "takeoff" | "landing";

export interface AviationEvent {
  id: string;
  craft: CraftType;
  craft_label: string;
  status: AviationStatus;
  source_channel: string;
  detected_at: string;
  expires_at: string;
  snippet: string;
}

export interface AviationActiveResponse {
  items: AviationEvent[];
  updated_at: string;
}

async function fetchAviation(): Promise<AviationActiveResponse> {
  const res = await fetch(`${ENV.apiBase}/api/v1/aviation/active`);
  if (!res.ok) throw new Error("aviation fetch failed");
  return res.json();
}

export function useAviation() {
  return useQuery({
    queryKey: ["aviation", "active"],
    queryFn: fetchAviation,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}
