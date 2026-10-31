import { sendAuthEmailViaPingram } from "@/lib/auth-email-delivery.server";

describe("Pingram auth email delivery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the managed auth message to Pingram with the app sender", async () => {
    vi.stubEnv("PINGRAM_API_KEY", "pingram_sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ trackingId: "trk-auth-1" }), { status: 200 }),
      );

    const result = await sendAuthEmailViaPingram({
      to: "ada@example.com",
      subject: "Confirm your email — Campus Delight",
      html: "<p>Verify me</p>",
      text: "Verify me",
      label: "signup",
    });

    expect(result).toEqual({ trackingId: "trk-auth-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("Expected Pingram fetch call");
    const init = call[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      type: "campus_delight_auth_signup",
      to: "ada@example.com",
      subject: "Confirm your email — Campus Delight",
      html: "<p>Verify me</p>",
      fromName: "Campus Delight",
      fromAddress: "noreply@compusdelight.net",
    });
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer pingram_sk_test");
  });
});
