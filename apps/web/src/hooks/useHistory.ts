import { useQuery } from "@tanstack/react-query";
import { api, type Period } from "@/lib/api";

export function useHistory(locationUid: number | null, period: Period) {
  return useQuery({
    queryKey: ["alerts", "history", locationUid, period],
    queryFn: () => api.alertsHistory(locationUid!, period),
    enabled: locationUid !== null,
    staleTime: 30_000,
  });
}

export function useHistoryByOblast(oblast: string | null, period: Period) {
  return useQuery({
    queryKey: ["alerts", "history-oblast", oblast, period],
    queryFn: () => api.alertsHistoryByOblast(oblast!, period),
    enabled: !!oblast,
    staleTime: 30_000,
  });
}

export function useSubRegionHistory(
  mkey: string | null,
  oblast: string | null,
  period: Period,
) {
  return useQuery({
    queryKey: ["alerts", "history-subregion", mkey, oblast, period],
    queryFn: () => api.alertsHistoryBySubregion(mkey!, oblast!, period),
    enabled: !!mkey && !!oblast,
    staleTime: 30_000,
  });
}
