/* Queen Sisi push worker — notifications only, no fetch caching.
   No skipWaiting / clients.claim: those let SW updates seize open tabs
   and can feel like random full-page reloads. */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {
    title: "Queen Sisi",
    body: "Something new happened",
    url: "/dashboard",
  };

  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/dashboard" },
      vibrate: [100, 50, 100],
    })
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
