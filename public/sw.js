/* MINERVOT Web Push Service Worker — handles background push + click deep links. */

const SW_VERSION = "minervot-push-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve(SW_VERSION));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
    })(),
  );
});

function toAbsoluteUrl(targetUrl) {
  try {
    return new URL(targetUrl || "/notifications", self.location.origin).href;
  } catch {
    return new URL("/notifications", self.location.origin).href;
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {
        notificationId: "unknown",
        title: "MINERVOT",
        body: "新しいお知らせがあります",
        targetUrl: "/notifications",
        severity: "important",
        eventCategory: "final_success",
      };

      try {
        if (event.data) {
          payload = { ...payload, ...event.data.json() };
        }
      } catch {
        /* use defaults */
      }

      const targetUrl = toAbsoluteUrl(payload.targetUrl);
      const tag = String(payload.notificationId || "minervot");

      await self.registration.showNotification(String(payload.title || "MINERVOT"), {
        body: String(payload.body || "新しいお知らせがあります"),
        tag,
        renotify: true,
        data: {
          notificationId: payload.notificationId,
          targetUrl,
          url: targetUrl,
          severity: payload.severity,
          eventCategory: payload.eventCategory,
        },
        icon: "/icons/icon-192.svg",
        badge: "/icons/icon-192.svg",
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = toAbsoluteUrl(data.targetUrl || data.url || "/notifications");
  const notificationId = data.notificationId;

  event.waitUntil(
    (async () => {
      const isTest =
        !notificationId ||
        notificationId === "test" ||
        String(notificationId).startsWith("test-");

      if (!isTest) {
        try {
          await fetch("/api/push/click", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notificationId }),
            credentials: "include",
          });
        } catch {
          /* best effort */
        }
      }

      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin && "focus" in client) {
            await client.focus();
            if ("navigate" in client && typeof client.navigate === "function") {
              await client.navigate(targetUrl);
            } else {
              client.postMessage({
                type: "MINERVOT_PUSH_NAVIGATE",
                url: targetUrl,
              });
            }
            return;
          }
        } catch {
          /* try next client */
        }
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
