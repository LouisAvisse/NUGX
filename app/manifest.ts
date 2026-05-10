// app/manifest.ts — [PHASE-12.7] PWA web app manifest.
//
// Next.js 15 App Router serves this at /manifest.webmanifest from
// the metadata API. With this file + the SW registration in
// app/layout.tsx + the matching <meta> tags, the dashboard becomes
// installable from the browser address bar (Chrome/Edge) and from
// the iOS Safari "Add to Home Screen" sheet.
//
// Icons live in /public/icons/. We declare the maskable + any-
// purpose variants Chrome's install heuristics expect; missing
// icon files render as the standard browser fallback (no fatal
// error).

import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NUGX — XAU/USD Terminal',
    short_name: 'NUGX',
    description:
      "Terminal d'analyse pour le trading XAU/USD : prix, macro, " +
      'actualités, calendrier, technique multi-timeframe et copilote IA.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'any',
    // Categories surface in install dialogs / app stores. Trading
    // tools fall under finance + business.
    categories: ['finance', 'business', 'productivity'],
    icons: [
      // SVG works for Chrome / Edge / Firefox install prompts and
      // scales for any size the OS asks for. iOS Safari prefers
      // PNG via the apple-touch-icon meta tag, which we set in
      // app/layout.tsx; SVG-only is fine for Android + desktop.
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
