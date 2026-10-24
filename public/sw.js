const CACHE = "ngf-shell-v5";
const ASSETS = "ngf-assets-v1";
const MAX_ASSETS = 96;
let pendingWrites = 0;
let assetWrites = Promise.resolve();
function cacheAsset(request, response) {
  if (pendingWrites >= 8) return Promise.resolve();
  pendingWrites++;
  assetWrites = assetWrites
    .catch(() => {})
    .then(async () => {
      const cache = await caches.open(ASSETS);
      await cache.put(request, response);
      const keys = await cache.keys();
      await Promise.all(
        keys
          .slice(0, Math.max(0, keys.length - MAX_ASSETS))
          .map((key) => cache.delete(key)),
      );
    })
    .catch(() => {})
    .finally(() => {
      pendingWrites--;
    });
  return assetWrites;
}
async function migrateLegacyAssets() {
  for (const name of await caches.keys()) {
    if (!name.startsWith("ngf-shell-") || name === CACHE) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      if (!new URL(request.url).pathname.startsWith("/assets/")) continue;
      const response = await cache.match(request);
      if (response) await cacheAsset(request, response);
    }
  }
}
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest?v=ngf2",
  "/icons/favicon-32.png?v=ngf2",
  "/icons/favicon-48.png?v=ngf2",
  "/ngf-logo.jpg",
  "/icons/icon-192.png?v=ngf2",
  "/icons/icon-512.png?v=ngf2",
  "/icons/icon-maskable-512.png?v=ngf2",
  "/icons/apple-touch-icon.png?v=ngf2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    migrateLegacyAssets().then(() =>
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (k) =>
                  (k.startsWith("ngf-shell-") || k.startsWith("ngf-assets-")) &&
                  k !== CACHE &&
                  k !== ASSETS,
              )
              .map((k) => caches.delete(k)),
          ),
        )
        .then(() => self.clients.claim()),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          if (response.ok)
            event.waitUntil(
              caches
                .open(CACHE)
                .then((cache) => cache.put("/index.html", copy))
                .catch(() => {}),
            );
          return response;
        })
        .catch(() =>
          caches
            .match("/index.html")
            .then((cached) => cached || Response.error()),
        ),
    );
    return;
  }

  if (
    !SHELL.includes(url.pathname) &&
    !url.pathname.startsWith("/assets/") &&
    !url.pathname.startsWith("/icons/")
  )
    return;
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            event.waitUntil(cacheAsset(request, copy));
          }
          return response;
        }),
    ),
  );
});
