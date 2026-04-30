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
export const metadata: Metadata = {
  title: "NUGX — XAU/USD Terminal",
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
      <body style={{ fontFamily: "var(--font-sans)" }}>{children}</body>
    </html>
  );
}
