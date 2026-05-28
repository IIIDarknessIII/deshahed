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
