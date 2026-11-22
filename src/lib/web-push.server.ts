import {
  createECDH,
  createCipheriv,
  createPrivateKey,
  createSign,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";

type PushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const textEncoder = new TextEncoder();

function base64Url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(normalized + "=".repeat((4 - (normalized.length % 4)) % 4), "base64");
}

function bodyArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Buffer {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(ikm), Buffer.from(salt), Buffer.from(info), length),
  );
}

function vapidKeyPair(privateKeyValue: string): {
  privateKey: KeyObject;
  publicKey: Buffer;
  publicKeyEncoded: string;
} {
  const privateBytes = decodeBase64Url(privateKeyValue);
  if (privateBytes.length !== 32)
    throw new Error("VAPID_PRIVATE_KEY must be a base64url-encoded P-256 private key");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateBytes);
  const publicKey = ecdh.getPublicKey(undefined, "uncompressed");
  const privateKey = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: base64Url(privateBytes),
      x: base64Url(publicKey.subarray(1, 33)),
      y: base64Url(publicKey.subarray(33, 65)),
    },
    format: "jwk",
  });
  return { privateKey, publicKey, publicKeyEncoded: base64Url(publicKey) };
}

function vapidAuthorization(endpoint: string, privateKeyValue: string, subject: string): string {
  const endpointUrl = new URL(endpoint);
  const keys = vapidKeyPair(privateKeyValue);
  const header = base64Url(textEncoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64Url(
    textEncoder.encode(
      JSON.stringify({
        aud: endpointUrl.origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign({ key: keys.privateKey, dsaEncoding: "ieee-p1363" });
  return `vapid t=${base64Url(signature)}, k=${keys.publicKeyEncoded}`;
}

/** RFC 8291 / RFC 8188 aes128gcm payload encryption for browser PushManager subscriptions. */
function encryptPayload(subscription: PushSubscription, payload: string): Buffer {
  const clientPublicKey = decodeBase64Url(subscription.p256dh);
  const authSecret = decodeBase64Url(subscription.auth);
  if (clientPublicKey.length !== 65 || clientPublicKey[0] !== 4)
    throw new Error("Invalid push subscription public key");
  if (authSecret.length < 16) throw new Error("Invalid push subscription auth secret");

  const ephemeral = createECDH("prime256v1");
  ephemeral.generateKeys();
  const ephemeralPublicKey = ephemeral.getPublicKey(undefined, "uncompressed");
  const ecdhSecret = ephemeral.computeSecret(clientPublicKey);

  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    clientPublicKey,
    ephemeralPublicKey,
  ]);
  const ikm = hkdf(ecdhSecret, authSecret, keyInfo, 32);
  const salt = randomBytes(16);
  const contentEncryptionKey = hkdf(
    ikm,
    salt,
    Buffer.from("Content-Encoding: aes128gcm\0", "utf8"),
    16,
  );
  const nonce = hkdf(ikm, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);
  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([ephemeralPublicKey.length]),
    ephemeralPublicKey,
    encrypted,
  ]);
}

export async function sendWebPush(
  subscription: PushSubscription,
  payload: unknown,
): Promise<"sent" | "gone"> {
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"];
  if (!privateKey || !subject)
    throw new Error("VAPID_PRIVATE_KEY and VAPID_SUBJECT are required for push notifications");
  const body = encryptPayload(subscription, JSON.stringify(payload));
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(subscription.endpoint, privateKey, subject),
      TTL: "300",
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
    },
    body: bodyArrayBuffer(body),
  });
  if (response.status === 404 || response.status === 410) return "gone";
  if (!response.ok) throw new Error(`Push service rejected notification (${response.status})`);
  return "sent";
}
