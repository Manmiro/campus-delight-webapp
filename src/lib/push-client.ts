import { getVapidPublicKey } from "@/lib/push.functions";

function decodeApplicationServerKey(value: string): ArrayBuffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = window.atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export type BrowserPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export function pushIsSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerBrowserPush(): Promise<BrowserPushSubscription> {
  if (!pushIsSupported())
    throw new Error("This browser does not support lock-screen notifications");
  const configuredPublicKey = import.meta.env["VITE_VAPID_PUBLIC_KEY"] as string | undefined;
  const publicKey = configuredPublicKey ?? (await getVapidPublicKey()).publicKey;
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Allow notifications in your browser settings to enable lock-screen alerts");
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeApplicationServerKey(publicKey),
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.["p256dh"] || !json.keys["auth"])
    throw new Error("The browser returned an incomplete push subscription");
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys["p256dh"], auth: json.keys["auth"] },
  };
}

export async function currentBrowserPushEndpoint(): Promise<string | null> {
  if (!pushIsSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

export async function removeBrowserPushSubscription(): Promise<string | null> {
  if (!pushIsSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
