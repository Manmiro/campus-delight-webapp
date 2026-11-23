import { createECDH, createPublicKey, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { vapidAuthorization } from "@/lib/web-push.server";
import { describePushTestResult } from "@/lib/push-test-result";

const b64url = (b: Buffer) => b.toString("base64url");

describe("VAPID authorization header", () => {
  it("sends a full three-part signed JWT that verifies with the public key", async () => {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const header = await vapidAuthorization(
      "https://fcm.googleapis.com/fcm/send/abc",
      b64url(ecdh.getPrivateKey()),
      "mailto:test@campusdelight.net",
    );
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const token = match?.[1] ?? "";
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString());
    expect(payload.aud).toBe("https://fcm.googleapis.com");
    const pub = ecdh.getPublicKey();
    const key = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
      format: "jwk",
    });
    const verifier = createVerify("SHA256");
    verifier.update(`${parts[0]}.${parts[1]}`);
    expect(
      verifier.verify({ key, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2] ?? "", "base64url")),
    ).toBe(true);
  });
});

describe("push test result message", () => {
  it("does not claim a missing device when delivery was refused", () => {
    const outcome = describePushTestResult({ sent: 0, gone: 0, failed: 1 }, "manager");
    expect(outcome.ok).toBe(false);
    expect(outcome.message).not.toContain("No active device");
  });
  it("reports missing devices only when none were found", () => {
    expect(describePushTestResult({ sent: 0, gone: 0, failed: 0 }, "hq").message).toContain(
      "No active manager or HQ device",
    );
  });
  it("succeeds when at least one device received it", () => {
    expect(describePushTestResult({ sent: 1, gone: 0, failed: 0 }, "manager").ok).toBe(true);
  });
});
