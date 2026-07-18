/* Queen Sisi push worker — notifications only, no fetch caching.
   No skipWaiting / clients.claim: those let SW updates seize open tabs
   and can feel like random full-page reloads. */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {
    title: "Queen Sisi",
    body: "Something new happened",
    url: "/dashboard",
    tag: undefined,
    requireInteraction: false,
    renotify: false,
    action: "show",
  };

  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }

  event.waitUntil(
    (async () => {
      // Clear a tagged notification (e.g. No contact released).
      if (payload.action === "close" && payload.tag) {
        const existing = await self.registration.getNotifications({
          tag: payload.tag,
        });
        for (const n of existing) n.close();
        // Still show a short release notice with the same tag so iOS replaces
        // the prior alert when the OS kept it.
        if (payload.title || payload.body) {
          await self.registration.showNotification(
            payload.title || "Queen Sisi",
            {
              body: payload.body,
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: payload.tag,
              renotify: true,
              data: { url: payload.url || "/dashboard" },
            }
          );
        }
        return;
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: payload.url || "/dashboard" },
        vibrate: [100, 50, 100],
        ...(payload.tag ? { tag: payload.tag } : {}),
        ...(payload.requireInteraction
          ? { requireInteraction: true }
          : {}),
        ...(payload.renotify ? { renotify: true } : {}),
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (!("focus" in client)) continue;
          try {
            const current = new URL(client.url);
            const target = new URL(targetUrl, self.location.origin);
            if (current.origin === target.origin) {
              if (current.pathname !== target.pathname) {
                return client.navigate(target.href).then((c) => c && c.focus());
              }
              return client.focus();
            }
          } catch {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
