import { useQuery } from "@tanstack/react-query";
import { ENV } from "@/lib/env";

interface OnlineResponse {
  online: number;
}

async function fetchOnline(): Promise<OnlineResponse> {
  const res = await fetch(`${ENV.apiBase}/api/v1/stats/online`);
  if (!res.ok) throw new Error("online fetch failed");
  return res.json();
}

export function useOnline() {
  return useQuery({
    queryKey: ["stats", "online"],
    queryFn: fetchOnline,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
