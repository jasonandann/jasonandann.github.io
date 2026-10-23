// Kill switch for the offline copy (issue #13).
//
// To turn offline support off on every device: copy this file over pes3/sw.js, commit and push.
//   cp tools/sw-off.js sw.js && git commit -am "Turn off the offline copy" && git push
// Leave it there. Do NOT just delete sw.js: a device that already has the worker keeps it (and the saved copy)
// when sw.js is missing, and would stay on that copy. Browsers re-download sw.js from the site on every launch
// (bypassing caches), so each device picks this up the next time the app opens with internet. It then deletes
// the saved copy and unregisters itself; pages load straight from the site again.
// Progress, Baffle stats and the garden live in localStorage and are not touched.
//
// js/offline.js still registers sw.js on each load; with this file in place that is a harmless no-op
// (it installs, finds nothing to delete, and unregisters again). No page is reloaded, so there is no loop.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const n of await caches.keys()) if (n.startsWith('pes3-')) await caches.delete(n);
  await self.registration.unregister();
})()));
// No fetch handler: every request goes to the network.
