/* DigitBot app: offline cache.
   Pages and scripts: network first (you always get the newest version), the saved copy when offline.
   Icons and the chart library: saved copy first.
   Not touched: prices/news from other sites, the .user.js installers (Tampermonkey must see them fresh), videos. */
const V = "digitbot-v2";
const CORE = ["./", "index.html", "trade.html", "trade.js", "engine.js", "lightweight-charts.js", "mmg.html", "screen.html",
  "tutorials.html", "pwa.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;              // live prices, news: straight to the internet
  if (/\.user\.js$|\/videos\//.test(u.pathname) || r.headers.has("range")) return;
  const fixed = /\/icons\/|lightweight-charts\.js$/.test(u.pathname);
  if (fixed) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })));
    return;
  }
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(hit => hit || (r.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
