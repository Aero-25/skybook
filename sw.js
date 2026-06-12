/* SkyBook service worker — deliberately conservative.
 *
 * This runs for EVERY visitor of the deployed site (web, the Android WebView,
 * the iPad PWA), so it must never serve stale code. Strategy:
 *   • Network-first for everything — online users always get fresh HTML/JS/CSS.
 *   • Cache only successful same-origin GET responses, purely as an OFFLINE
 *     fallback (used when the network request fails).
 *   • Never touch cross-origin requests (Supabase API, fonts, OneSignal, etc.).
 *   • Versioned cache + skipWaiting/clients.claim so updates take effect at once.
 */
const CACHE = 'skybook-offline-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Only handle same-origin GETs; everything else passes straight through.
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // Cache a copy of good responses for offline use.
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const copy = fresh.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch (err) {
      // Offline — fall back to the last cached copy if we have one.
      const cached = await caches.match(req);
      if (cached) return cached;
      // For navigations with nothing cached, try the admin shell.
      if (req.mode === 'navigate') {
        const shell = await caches.match('/booking-admin.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
