// Headroom service worker: opens instantly / offline from cache, and shows push notifications.
const VERSION = "headroom-v20";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/badge-96.png",
  "./vendor/supabase-js-2.119.0.js", "./vendor/chart-4.6.1.umd.min.js"];
const CDN = "https://cdn.jsdelivr.net/";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // The app itself: always ask the server first (skipping the browser's short-term cache) so updates show up on the
  // next open; fall back to the saved copy offline.
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req, { cache: "no-cache" }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
    return;
  }
  // Chart and database libraries: use the saved copy immediately, refresh it in the background.
  if (req.url.startsWith(CDN)) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // Everything else (your bank data) always comes live from the server.
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Headroom", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Headroom", {
    body: d.body || "", tag: d.tag || undefined, icon: "icons/icon-192.png", badge: "icons/badge-96.png", data: { url: d.url || "#overview" },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || "#overview";
  const target = new URL("./" + (hash.startsWith("#") ? hash : "#" + hash), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) { open.postMessage({ go: hash.replace("#", "") }); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});
