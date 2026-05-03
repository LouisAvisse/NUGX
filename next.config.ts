import type { NextConfig } from 'next'

// [DEPLOY] Security headers applied to every response.
//
// Originally NUGX was a localhost-only dashboard so an empty
// next.config.ts was fine — the security audit (audit/01-
// security-audit.txt > §I9) explicitly flagged that this
// becomes HIGH severity once the app moves off localhost.
// This config addresses every header item flagged for public
// deployment without breaking the TradingView iframe or the
// existing API routes.
//
// Rationale per header:
//
//   X-Frame-Options: DENY
//     We never embed our own dashboard in an iframe — DENY is
//     the strictest setting. (We DO embed TradingView IN our
//     dashboard, which is a separate concern handled by
//     allow-list and the iframe sandbox attribute on the widget
//     itself.)
//
//   X-Content-Type-Options: nosniff
//     Stops browsers from MIME-sniffing scripts out of
//     non-script responses. Cheap, no compatibility cost.
//
//   Referrer-Policy: strict-origin-when-cross-origin
//     Limits Referer header to the origin (no path / query)
//     when navigating cross-site. Prevents leaking analysis
//     parameters or session state to TradingView.
//
//   Strict-Transport-Security
//     Forces HTTPS for one year (max-age=31536000). Vercel
//     terminates TLS automatically; this header just hardens
//     the browser-side behaviour against downgrade attacks.
//
//   X-DNS-Prefetch-Control: on
//     Lets the browser prefetch DNS for outbound asset
//     requests (TradingView, gold-api, etc). Pure perf.
//
//   Permissions-Policy
//     Disable APIs we never use (camera, microphone,
//     geolocation, payment) so a future XSS can't gain access
//     even if it lands.
//
//   Content-Security-Policy
//     The most powerful and the most tedious to maintain.
//     We allow:
//       - 'self' for our own scripts/styles/fonts
//       - 'unsafe-inline' on style-src — Next.js inlines small
//         CSS critical-paths and inline-style attributes for
//         widget overrides; switching to nonces would break
//         the lightweight-charts overlay
//       - 'unsafe-eval' on script-src — required by Next.js
//         dev mode and by TradingView's widget bootstrap
//       - https://www.tradingview.com + https://s.tradingview.com
//         on frame-src + script-src so the embedded chart loads
//       - https://api.gold-api.com + https://news.google.com
//         on connect-src so the client can't be tricked into
//         talking to other domains via a future bug
//       - data: + blob: on img-src for dynamically generated
//         lightweight-charts canvases
//
// Header math: ~600 bytes per response, well under any limit
// and gzipped further on the wire.
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js + TradingView widget bootstrap need eval +
      // inline; we accept the trade-off for a single-trader
      // app where the bigger threat vector is upstream feed
      // poisoning, which the security audit's M1/M2/M3 fixes
      // already address at the data layer.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s.tradingview.com https://www.tradingview.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://api.gold-api.com https://news.google.com https://www.tradingview.com https://s.tradingview.com",
      "frame-src https://www.tradingview.com https://s.tradingview.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  // [DEPLOY] Apply the security headers to every route. Next's
  // headers() callback receives the request URL and returns a
  // list of {source, headers} entries; the wildcard source
  // ':path*' matches every response, including API routes.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

export default nextConfig
