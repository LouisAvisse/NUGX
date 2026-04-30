// Root layout for the Gold Terminal dashboard.
// Loads Geist Mono once at the root so every descendant inherits the
// terminal-style monospace font via the --font-mono CSS variable.

import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Initialize the Geist Mono variable font and expose it as `--font-mono`.
// Components can then reference it with `font-family: var(--font-mono)`,
// keeping the font wiring decoupled from individual elements.
const geistMono = GeistMono;

// Browser tab title — kept short and signal-dense, matching the
// "this is a terminal, not a website" tone in the spec.
export const metadata: Metadata = {
  title: "XAU/USD — Gold Terminal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font's `.variable` class injects the --font-mono CSS variable
    // onto <html>, making it available to every descendant including
    // <body> and any portaled UI.
    <html lang="en" className={geistMono.variable}>
      {/* Inline style guarantees the font applies even before globals.css
          loads, avoiding a flash of fallback monospace on first paint. */}
      <body style={{ fontFamily: "var(--font-mono)" }}>{children}</body>
    </html>
  );
}
