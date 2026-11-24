// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => {
  const chain = { inputValidator: () => chain, handler: <T>(fn: T) => fn };
  return { createServerFn: () => chain };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
import { createClient } from "@supabase/supabase-js";
import { listOutlets } from "@/lib/catalog.functions";

afterEach(() => vi.resetAllMocks());

function mockDirectoryQuery(order: ReturnType<typeof vi.fn>) {
  const query = { select: vi.fn(), eq: vi.fn(), order };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  vi.mocked(createClient).mockReturnValue({ from: vi.fn(() => query) } as unknown as ReturnType<typeof createClient>);
}

describe("public outlet failure semantics", () => {
  it("does not convert a network failure to a successful empty directory", async () => {
    mockDirectoryQuery(vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(listOutlets()).rejects.toThrow("Failed to fetch");
  });
  it("does not convert a backend error to a successful empty directory", async () => {
    mockDirectoryQuery(vi.fn().mockResolvedValue({ data: null, error: { message: "Directory unavailable" } }));
    await expect(listOutlets()).rejects.toThrow("Directory unavailable");
  });
  it("returns zero outlets only for a successful empty result", async () => {
    mockDirectoryQuery(vi.fn().mockResolvedValue({ data: [], error: null }));
    await expect(listOutlets()).resolves.toEqual([]);
  });
});