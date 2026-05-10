// Root layout for the NUGX dashboard.
//
// Loads BOTH Geist Sans (the new default UI face) and Geist Mono
// (kept available for any numeric display that wants tabular
// alignment) at the root. Variable classes injected on <html>
// expose the per-Next.js-font CSS custom properties:
//   GeistSans.variable → --font-geist-sans
//   GeistMono.variable → --font-geist-mono
// globals.css then aliases those to the dashboard-friendly names
// `--font-sans` and `--font-mono` so component code references a
// stable token regardless of which font is wired underneath.

import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Browser tab title — leads with NUGX, then the symbol so a tab
// peek tells the trader the app + the instrument at a glance.
// (page.tsx overrides this dynamically once a price tick lands.)
//
// [PHASE-12.7] PWA metadata. The web manifest is exposed via
// app/manifest.ts (Next 15 metadata API). The meta tags below
// cover iOS Safari's "Add to Home Screen" path which Apple still
// gates on the legacy apple-* meta cluster rather than the
// standard manifest.
export const metadata: Metadata = {
  title: 'NUGX — XAU/USD Terminal',
  applicationName: 'NUGX',
  appleWebApp: {
    capable: true,
    title: 'NUGX',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  // Manifest URL is auto-emitted by Next when app/manifest.ts
  // exists; declaring it explicitly here makes the link tag
  // render even if the build pipeline ever swaps detection logic.
  manifest: '/manifest.webmanifest',
};

export const viewport = {
  themeColor: '#0a0a0a',
  // Lock the user-zoom on phones so chart pinch-zoom doesn't
  // accidentally scale the whole UI.
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Both font classes on <html>: each adds its own CSS custom
    // property, both available everywhere. Body picks Sans as the
    // default; components can opt into Mono via `var(--font-mono)`
    // when they need it (price digits, indicator values).
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      {/* Inline style guarantees the font applies even before
          globals.css loads, avoiding a flash of system sans-serif
          on first paint. */}
      <body style={{ fontFamily: "var(--font-sans)" }}>
        {children}
        {/* [PHASE-12.7] Service worker registration — installs the
            shell cache + the network-first /api/* handler. The
            dynamic-import keeps the registration out of the SSR
            bundle. Failures are silent: no SW = no offline support,
            but the rest of the app still works. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker
                    .register('/sw.js')
                    .catch(function (err) {
                      console.warn('[sw] registration failed:', err);
                    });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
