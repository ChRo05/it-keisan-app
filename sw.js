/* 通信のない所でも開けるようにする仕組み（サービスワーカー）
   通信できるときは新しい版を取りに行き、取れたら手元に写しを残す。
   通信できないときは、手元の写しを出す。学習の記録はここでは扱わない（どこにも送らない）。 */
const CACHE = "itkeisan-v1";
const FILES = ["./", "./index.html", "./manual/", "./manual/index.html"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
