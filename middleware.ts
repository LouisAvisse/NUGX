// middleware.ts — [DEPLOY] public-deploy safety layer.
//
// When the dashboard is gated behind Vercel SSO (the default
// for production previews on personal accounts) the URL is
// already protected — only invited Vercel members can reach
// any route, including the paid /api/analyze + /api/briefing
// routes that consume Anthropic credit.
//
// Once the trader disables Vercel Authentication so the URL is
// publicly shareable, those two routes become directly
// reachable by anyone with the URL — including bots and
// curl-scrapers. At ~$0.02 per Claude call, even a few
// thousand drive-by hits can run a real bill.
//
// This middleware is the cheap safety net. It does NOT replace
// proper KV-backed rate limiting (Upstash / Vercel KV) — that
// remains the right answer for a heavy-traffic deployment.
// What it DOES is:
//
//   1. Same-origin gate. /api/analyze and /api/briefing only
//      respond when the request's Origin or Referer header
//      matches the deployment host. The browser-driven UI on
//      the partner's machine always sets these headers
//      automatically; naive curl abuse without spoofed
//      headers is blocked at zero cost.
//
//   2. Best-effort in-memory rate limit. A small Map keyed by
//      IP throttles requests to MAX_PER_WINDOW per
//      WINDOW_MS. Vercel Serverless instances reuse warm
//      containers for ~5 minutes, so the limit holds across
//      bursts within that window. Cold starts reset the
//      counter — that's the trade-off for not paying for KV.
//      Combined with the origin gate, the abuse cost stays
//      low.
//
// Routes left fully public:
//   /, /api/price, /api/signals, /api/technicals, /api/news,
//   /api/calendar, /api/replay, /api/backtest
//
// All of those either return cheap free-data or are pure
// computation. None call Anthropic.

import { NextRequest, NextResponse } from 'next/server'

// Routes that gate Anthropic API spending. Anything not in this
// list passes through untouched.
const PROTECTED_ROUTES = ['/api/analyze', '/api/briefing']

// Rate-limit knobs. 8 calls per 10 minutes per IP is roughly
// 4× the normal trader cadence (the dashboard auto-triggers
// /api/analyze every 30 min by default + the morning briefing
// fires once per UTC day). A legit user never hits the cap;
// a scraper hits it instantly.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 8

// In-memory bucket keyed by IP. Reset implicitly on cold
// start. Map size is bounded by IP diversity in any 10-min
// window — typically tiny.
const buckets = new Map<string, { count: number; windowStart: number }>()

// Read the client IP from the request. Vercel sets x-real-ip
// and x-forwarded-for; we prefer the first IP in
// x-forwarded-for since that's the actual client (Vercel adds
// its own proxy IPs after).
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip') ?? 'unknown'
}

// Check + tick the bucket. Returns true when the request is
// within the limit; false when it should be blocked.
function tickRateLimit(ip: string): boolean {
  const now = Date.now()
  const existing = buckets.get(ip)
  if (!existing || now - existing.windowStart > WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (existing.count >= MAX_PER_WINDOW) return false
  existing.count++
  return true
}

// Origin check — at least one of {Origin, Referer} must point
// at the same host the request is hitting. POST requests
// without an Origin (curl, fetch from another host) are
// blocked. The dashboard UI always sends both headers for
// same-origin XHRs, so legitimate use never trips this.
function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get('host')
  if (!host) return false
  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  // Local development: Next sets Origin to http://localhost:PORT.
  // We accept any localhost origin so the Phase-11 backtest curl
  // tests against http://localhost:3000 still work in dev.
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) {
    return true
  }
  if (origin && origin.endsWith(`//${host}`)) return true
  if (referer && referer.includes(`//${host}/`)) return true
  return false
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  const protectedHit = PROTECTED_ROUTES.some(
    (p) => path === p || path.startsWith(p + '/')
  )
  if (!protectedHit) return NextResponse.next()

  // 1. Same-origin gate — block direct curl + cross-origin scrapers.
  if (!isSameOrigin(req)) {
    return new NextResponse(
      JSON.stringify({ error: 'origin not allowed' }),
      { status: 403, headers: { 'content-type': 'application/json' } }
    )
  }

  // 2. Rate limit per IP.
  const ip = clientIp(req)
  if (!tickRateLimit(ip)) {
    return new NextResponse(
      JSON.stringify({ error: 'rate limit exceeded — try again in a few minutes' }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(Math.ceil(WINDOW_MS / 1000)),
        },
      }
    )
  }
  return NextResponse.next()
}

// Constrain matcher so the middleware only runs on the protected
// routes — no per-request overhead on the hot dashboard fetches
// (price/signals/technicals/news).
export const config = {
  matcher: ['/api/analyze/:path*', '/api/briefing/:path*'],
}
