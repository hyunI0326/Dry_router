const OFFLINE_CACHE_PREFIX = "dry-router-offline-";
const OFFLINE_CACHE = `${OFFLINE_CACHE_PREFIX}v1`;
const offlineUrl = new URL("/offline.html", self.location.origin);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.add(new Request(offlineUrl, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX) && name !== OFFLINE_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (
    request.mode !== "navigate" ||
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      return (
        (await caches.match(offlineUrl.href, { cacheName: OFFLINE_CACHE })) ?? Response.error()
      );
    }),
  );
});
