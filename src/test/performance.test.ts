import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/lib/catalog.functions", () => ({ listOutlets: vi.fn(async () => [{ id: "outlet-a" }]) }));

import { listOutlets } from "@/lib/catalog.functions";
import { publicOutletsQuery } from "@/lib/catalog.queries";
import { walletQuery, tokenAccountQuery, creditQuery, myMenuQuery, myPlanPricesQuery, loanRestrictionsQuery } from "@/lib/queries";
import { getRouter } from "@/router";

describe("Performance safeguards", () => {
  it("reuses the public outlet directory within its ten-minute freshness window", async () => {
    const client = new QueryClient();
    vi.mocked(listOutlets).mockClear();
    await client.fetchQuery(publicOutletsQuery);
    await client.fetchQuery(publicOutletsQuery);
    expect(listOutlets).toHaveBeenCalledTimes(1);
    expect(publicOutletsQuery.staleTime).toBe(600_000);
    client.clear();
  });

  it("does not extend freshness for money, restrictions or checkout prices", () => {
    const client = new QueryClient();
    for (const options of [walletQuery, tokenAccountQuery, creditQuery, loanRestrictionsQuery, myMenuQuery("outlet-a"), myPlanPricesQuery("outlet-a")]) {
      expect(options.staleTime ?? client.getDefaultOptions().queries?.staleTime ?? 0).toBe(0);
    }
  });

  it("preloads on intent and keeps each router's query cache isolated", () => {
    const first = getRouter();
    const second = getRouter();
    expect(first.options.defaultPreload).toBe("intent");
    expect(first.options.defaultPreloadDelay).toBe(50);
    expect(first.options.defaultPreloadStaleTime).toBe(0);
    expect(first.options.context?.queryClient).not.toBe(second.options.context?.queryClient);
  });
});