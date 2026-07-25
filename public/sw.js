/* MINERVOT Web Push Service Worker — handles background push + click deep links. */

const SW_VERSION = "minervot-push-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
    })(),
  );
});

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

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.notificationId,
        renotify: true,
        data: {
          notificationId: payload.notificationId,
          targetUrl: payload.targetUrl,
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
  const targetUrl = data.targetUrl || "/notifications";
  const notificationId = data.notificationId;

  event.waitUntil(
    (async () => {
      if (notificationId && notificationId !== "test") {
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
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            await client.navigate(targetUrl);
          }
          return;
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
