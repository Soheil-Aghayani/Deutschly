const CACHE_NAME = "deutschly-shell-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.svg",
  "./icon-512.svg",
  "./og-preview.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => (cacheName.startsWith("apricity-shell-") || cacheName.startsWith("deutschly-shell-")) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.action === "review" ? "./?tab=study" : event.notification.data?.url || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existingClient = clientList.find((client) => "focus" in client);
      if (existingClient) {
        return existingClient.focus().then(() => existingClient.navigate?.(targetUrl));
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() || "Your German review is ready." };
  }

  const title = typeof data.title === "string" && data.title.trim() ? data.title : "Deutschly review reminder";
  const body = typeof data.body === "string" && data.body.trim() ? data.body : "Your German cards are ready for review.";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "./icon-192.svg",
    badge: "./icon-192.svg",
    tag: typeof data.tag === "string" ? data.tag : "deutschly-push-review",
    renotify: true,
    actions: [{ action: "review", title: "Review now" }],
    data: { url: "./?tab=study" },
  }));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin || requestUrl.pathname.includes("/api/")) return;

  const isDocumentRequest = request.mode === "navigate" || request.destination === "document";
  if (isDocumentRequest) {
    const shellUrl = new URL("./index.html", self.registration.scope).toString();

    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(shellUrl, copy)));
          return response;
        })
        .catch(() => caches.match(shellUrl)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => request.mode === "navigate" ? caches.match("./index.html") : Response.error());
    }),
  );
});
