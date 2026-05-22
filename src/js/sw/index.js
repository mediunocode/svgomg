/* globals SVGOMG_VERSION:false */

import { idbKeyval as storage } from '../utils/storage.js';

const version = SVGOMG_VERSION;
const cachePrefix = 'svgomg-';
const staticCacheName = `${cachePrefix}static-${version}`;
const fontCacheName = `${cachePrefix}fonts`;
const expectedCaches = new Set([staticCacheName, fontCacheName]);

addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const activeVersionPromise = storage.get('active-version');
      const cache = await caches.open(staticCacheName);

      await cache.addAll([
        './',
        'all.css',
        'changelog.json',
        'fonts/code-latin.woff2',
        'imgs/icon.png',
        'js/gzip-worker.js',
        'js/page.js',
        'js/prism-worker.js',
        'js/svgo-worker.js',
        'test-svgs/car-lite.svg',
      ]);

      const activeVersion = await activeVersionPromise;

      // If it's a major version change, don't skip waiting
      if (
        !activeVersion ||
        activeVersion.split('.')[0] === version.split('.')[0]
      ) {
        self.skipWaiting();
      }
    })(),
  );
});

addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // remove caches beginning "svgomg-" that aren't in expectedCaches
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(cachePrefix) &&
              !expectedCaches.has(cacheName),
          )
          .map((cacheName) => caches.delete(cacheName)),
      );

      await storage.set('active-version', version);
    })(),
  );
});

async function handleFontRequest(request) {
  const match = await caches.match(request);
  if (match) return match;

  const [response, fontCache] = await Promise.all([
    fetch(request),
    caches.open(fontCacheName),
  ]);

  fontCache.put(request, response.clone());
  return response;
}

async function handleNavigate(request) {
  const cache = await caches.open(staticCacheName);
  const cached =
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match('./'));

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put('./', response.clone());
      }

      return response;
    })
    .catch(() => null);

  return cached || (await networkPromise) || Response.error();
}

addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept cross-origin requests (Mediavine, GA, Plausible, etc.).
  if (url.origin !== location.origin) return;

  // Always go to network for ads.txt so bidder configuration stays fresh.
  if (url.pathname === '/ads.txt') return;

  if (url.pathname.endsWith('.woff2')) {
    event.respondWith(handleFontRequest(request));
    return;
  }

  // Stale-while-revalidate for navigations so Mediavine script-tag changes
  // propagate within a single repeat visit instead of waiting for a SW
  // version bump.
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((response) => response || fetch(request)),
  );
});
