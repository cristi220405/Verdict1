/* Verdict service worker — offline app shell + runtime caching */
const CACHE = "verdict-v4";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-1024.png",
  "./apple-touch-icon.png",
  "./favicon.png"
];

// Precache the app shell on install — tolerant: one missing file must not
// abort the whole install (caches.addAll fails wholesale, so add individually)
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

// Drop old caches on activate
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Page loads: network-first (so a fresh deploy shows up immediately when online),
// falling back to cache when offline. Assets/fonts/library: stale-while-revalidate.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isShell = url.origin === self.location.origin;
  const isAsset = /cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.href);
  if (!isShell && !isAsset) return; // let API calls hit the network directly

  const isPage = req.mode === "navigate" ||
    (isShell && (url.pathname.endsWith("/") || url.pathname.endsWith(".html")));

  if (isPage) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
