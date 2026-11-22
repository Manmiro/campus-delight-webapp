const DEFAULT_URL = "/outlet/orders";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "Campus Delight",
      body: event.data?.text() || "You have a new outlet update.",
    };
  }

  const title = payload.title || "New Campus Delight Order";
  const options = {
    body: payload.body || "A new order is waiting in outlet orders.",
    icon: payload.icon || "/apple-touch-icon.png",
    badge: payload.badge || "/favicon.png",
    vibrate: payload.vibration || [250, 120, 250],
    tag: payload.tag || "campus-delight-order",
    renotify: true,
    silent: false,
    requireInteraction: true,
    data: {
      ...(payload.data || {}),
      url: payload.url || DEFAULT_URL,
      orderId: payload.orderId || null,
      announcement:
        payload.announcement || "You have a new Campus Delight order, check and fulfill.",
    },
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const message = {
        type: "campus-delight-order-push",
        orderId: options.data.orderId,
        announcement: options.data.announcement,
      };
      windows.forEach((client) => client.postMessage(message));
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destinationUrl = new URL(event.notification.data?.url || DEFAULT_URL, self.location.origin);
  if (event.notification.data?.orderId) {
    destinationUrl.searchParams.set("pushOrder", event.notification.data.orderId);
  }
  const destination = destinationUrl.href;
  const message = {
    type: "campus-delight-order-opened",
    orderId: event.notification.data?.orderId || null,
    announcement:
      event.notification.data?.announcement ||
      "You have a new Campus Delight order, check and fulfill.",
  };
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing && "focus" in existing) {
        await existing.focus();
        if ("navigate" in existing) await existing.navigate(destination);
        existing.postMessage(message);
        return;
      }
      await self.clients.openWindow(destination);
    })(),
  );
});
