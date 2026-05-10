/* eslint-disable no-restricted-globals */
// public/sw.js — [PHASE-12.7] minimal service worker.
//
// Two responsibilities:
//
//   1. Pre-cache the app shell at install time so the dashboard
//      can paint a skeleton when the user opens it offline.
//
//   2. Network-first for /api/* routes (we always want fresh data
//      when online) with a cache fallback (so a flaky connection
//      reads the last-known response instead of erroring).
//
// We deliberately keep this tiny — no Workbox, no precache
// manifest, no background sync. The dashboard is data-driven; an
// over-aggressive cache would be worse than no cache at all
// (stale prices, stale signals).

const CACHE_NAME = 'nugx-shell-v1'
const SHELL_URLS = ['/']

// ── Install: pre-cache the shell. ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  )
  // Activate this worker immediately on first install — avoids the
  // "old-tab still controlled by previous SW" gotcha.
  self.skipWaiting()
})

// ── Activate: clean up any old shell caches. ───────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch handler. ─────────────────────────────────────────────
//
// Strategy:
//   - GET requests only (don't cache POST / mutations).
//   - /api/* → network first, cache fallback.
//   - HTML / shell → cache first (with network background refresh).
//   - Everything else → just hit the network (let the browser HTTP
//     cache do its job).
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Network-first for API routes.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache the freshest successful response so an offline
          // tab can still render the last-known data.
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(async () => {
          const cached = await caches.match(req)
          if (cached) return cached
          // No cache, no network — return an explicit 503 so the
          // client's catch() branch fires its FALLBACK shape.
          return new Response('{"error":"offline"}', {
            status: 503,
            headers: { 'content-type': 'application/json' },
          })
        })
    )
    return
  }

  // Cache-first for navigations / shell.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      caches.match('/').then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put('/', clone))
            return res
          })
      )
    )
    return
  }
  // Pass-through for everything else.
})
