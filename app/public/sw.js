// Service worker: web-push + conservative offline caching.
//
// Caching strategy is deliberately safe so it never pins a stale build or leaks
// data:
//   • The cache name carries a per-build id (sw-version.js, stamped by
//     scripts/gen-sw-version.mjs), so every deploy gets a fresh cache and the
//     activate handler prunes the previous one — content-hashed /_next/static
//     can't accumulate on a device across deploys.
//   • Hashed /_next/static assets are immutable → cache-first (fast).
//   • Navigations are network-first and are NEVER stored — dashboard HTML can
//     carry client data and must not persist after a session expires. Offline,
//     the precached public /offline page is shown instead.
// Writes (POST/PATCH/…) are never touched here; the app queues those itself.

// Stamped per build; falls back to a constant if the file is absent (dev).
try {
  importScripts("/sw-version.js");
} catch (e) {
  /* not generated — dev fallback below */
}
const CACHE = "hk-" + (self.__SW_BUILD || "dev");
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // writes go straight to the network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin

  // Immutable, content-hashed build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
    return;
  }

  // API responses carry client/invoice data — never cache them at rest.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first, and never stored (auth-gated HTML). Fall back to
  // the precached public offline page when the network is unreachable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match("/offline")) || new Response("Offline", { status: 503, statusText: "Offline" }))
    );
    return;
  }

  // Other same-origin GETs (icon, manifest, …): cache-first from the precache,
  // then network. Nothing new is stored beyond what install() precached.
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});

// ---- Web push (unchanged) --------------------------------------------------

self.addEventListener("push", (event) => {
  // The server push payload carries the real (brand-configured) title; this is
  // only a fallback if the payload is empty, so keep it brand-neutral.
  let data = { title: "New notification", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
