// @vitest-environment node
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog.functions", () => ({ listOutlets: vi.fn() }));
import { listOutlets } from "@/lib/catalog.functions";
import { publicOutletsQuery } from "@/lib/catalog.queries";
import { loadLandingOutlets } from "@/lib/landing-outlets";

const clients: QueryClient[] = [];
function client() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  return queryClient;
}
afterEach(() => { clients.forEach((c) => c.clear()); clients.length = 0; vi.resetAllMocks(); });

describe("optional homepage outlet directory", () => {
  it("carries the actual outlet rows and their timestamp through route hydration", async () => {
    const rows = [{ id: "outlet-1", name: "Test outlet", code: "TEST", location: "Campus", status: "active" }];
    vi.mocked(listOutlets).mockResolvedValue(rows);
    const serverClient = client();
    const snapshot = await loadLandingOutlets(serverClient);
    const browserClient = client();
    if (snapshot.outlets === null) throw new Error("Missing directory snapshot");
    const hydrated = await browserClient.fetchQuery({
      ...publicOutletsQuery, initialData: snapshot.outlets, initialDataUpdatedAt: snapshot.updatedAt,
    });
    expect(hydrated).toEqual(rows);
    expect(snapshot.updatedAt).toBeGreaterThan(0);
    expect(listOutlets).toHaveBeenCalledTimes(1);
  });

  it("does not fail the homepage or report a false zero count after an RPC parse failure", async () => {
    vi.mocked(listOutlets).mockRejectedValue(new SyntaxError("Unexpected token '{'"));
    await expect(loadLandingOutlets(client())).resolves.toEqual({ outlets: null, updatedAt: 0 });
  });

  it("preserves existing rows when a directory refresh fails", async () => {
    const queryClient = client();
    const rows = [{ id: "outlet-1", name: "Test outlet", code: "TEST", location: "Campus", status: "active" }];
    queryClient.setQueryData(publicOutletsQuery.queryKey, rows);
    vi.mocked(listOutlets).mockRejectedValue(new Error("Network unavailable"));
    await expect(queryClient.fetchQuery({ ...publicOutletsQuery, staleTime: 0 })).rejects.toThrow("Network unavailable");
    expect((await loadLandingOutlets(queryClient)).outlets).toEqual(rows);
  });

  it("still allows a genuine empty directory to report zero", async () => {
    vi.mocked(listOutlets).mockResolvedValue([]);
    expect((await loadLandingOutlets(client())).outlets).toEqual([]);
  });
});