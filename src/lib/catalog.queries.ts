import { queryOptions } from "@tanstack/react-query";
import { listOutlets } from "@/lib/catalog.functions";

// Only the public outlet directory is long-lived. Prices, balances and
// eligibility keep their live query defaults and mutation invalidation.
export const publicOutletsQuery = queryOptions({
  queryKey: ["public-outlets"],
  queryFn: () => listOutlets(),
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
});