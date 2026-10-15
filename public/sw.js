const CACHE = "ngf-shell-v4";
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
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("ngf-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
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
            caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
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
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
