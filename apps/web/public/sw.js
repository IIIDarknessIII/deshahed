// Minimal service worker — gives browsers what they need to treat the page as
// installable (a fetch handler must exist) without trying to do clever caching
// of a realtime app. We just pass every request through to the network and
// only fall back to a tiny cached shell on hard offline.

const SHELL_CACHE = "deshahed-shell-v1";
const SHELL_PATHS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_PATHS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Never cache POSTs, API, WS upgrades, etc — only opportunistic GETs.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) {
    return; // let the browser do its normal fetch
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req).then((r) => r || caches.match("/")))
  );
});
