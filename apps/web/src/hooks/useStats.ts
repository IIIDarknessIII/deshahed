import { useQuery } from "@tanstack/react-query";
import { api, type Period } from "@/lib/api";

export function useStatsSummary(period: Period = "day") {
  return useQuery({
    queryKey: ["stats", "summary", period],
    queryFn: () => api.statsSummary(period),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}
