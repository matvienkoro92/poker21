/* Минимальный Service Worker для PWA (добавление на рабочий стол) */
self.addEventListener("install", function () {
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", function () {
  /* Pass through — требуется для installability в Chrome */
});
