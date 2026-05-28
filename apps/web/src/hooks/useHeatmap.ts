import { useQuery } from "@tanstack/react-query";
import { api, type HeatmapType, type Period } from "@/lib/api";

export function useHeatmap(period: Period, type: HeatmapType, enabled: boolean) {
  return useQuery({
    queryKey: ["heatmap", period, type],
    queryFn: () => api.heatmap(period, type),
    enabled,
    staleTime: 5 * 60_000,           // server recomputes hourly; UI staleness 5 min is fine
    refetchInterval: 5 * 60_000,
  });
}
