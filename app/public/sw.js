// Harrington Kitchens service worker: web-push + conservative offline caching.
//
// Caching strategy is deliberately safe so it never pins a stale build:
//   • Hashed /_next/static assets are immutable → cache-first (fast).
//   • Everything else (HTML, API GETs) is network-first → always fresh when
//     online, cached copy only as an offline fallback.
// Writes (POST/PATCH/…) are never touched here; the app queues those itself.

const CACHE = "harringtonkitchens-v1";
const PRECACHE = ["/", "/manifest.webmanifest", "/icon.svg"];

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

  // API responses carry client/invoice data — never cache them at rest. Just
  // pass through to the network (offline callers handle the failure).
  if (url.pathname.startsWith("/api/")) return;

  // Navigations + other GETs: network-first, fall back to cache offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      })
  );
});

// ---- Web push (unchanged) --------------------------------------------------

self.addEventListener("push", (event) => {
  let data = { title: "Harrington Kitchens", body: "", url: "/" };
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
