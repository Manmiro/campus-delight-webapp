import type { QueryClient } from "@tanstack/react-query";
import { publicOutletsQuery } from "@/lib/catalog.queries";

/** Carry the directory through route hydration; failed refreshes keep old data. */
export async function loadLandingOutlets(queryClient: QueryClient) {
  try {
    await queryClient.ensureQueryData(publicOutletsQuery);
  } catch {
    // The public directory is optional; never replace the homepage with an error.
  }
  return {
    outlets: queryClient.getQueryData(publicOutletsQuery.queryKey) ?? null,
    updatedAt: queryClient.getQueryState(publicOutletsQuery.queryKey)?.dataUpdatedAt ?? 0,
  };
}