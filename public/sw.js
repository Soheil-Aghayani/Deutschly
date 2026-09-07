const CACHE_NAME = "apricity-shell-v11";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.svg",
  "./icon-512.svg",
  "./apricity-garden-map.webp",
  "./apricity-tree.webp",
  "./apricity-tree-peach.webp",
  "./apricity-tree-apple.webp",
  "./apricity-tree-cherry.webp",
  "./apricity-tree-lemon.webp",
  "./apricity-flower.webp",
  "./apricity-bush.webp",
  "./apricity-butterfly.webp",
  "./apricity-butterfly-sprite.webp",
  "./apricity-bench.webp",
  "./apricity-lamp.webp",
  "./apricity-cat.webp",
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
          .filter((cacheName) => cacheName.startsWith("apricity-shell-") && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

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
