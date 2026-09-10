// Online-only replacement for the old offline cache worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('pixel-steward-')).map(key => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
// No fetch handler: all app and API requests use the browser network.
