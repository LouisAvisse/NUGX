# NUGX — Gold Trading Dashboard

A personal day trading dashboard for **XAU/USD**. Live price feed, TradingView
chart, macro signals (DXY, US10Y), curated gold/macro news, and an
AI-powered trade analysis (bias, key levels, entry/stop/target).

Local-first, terminal-style UI. Built for daily personal use during trading
sessions — not a commercial product.

## Stack
- **Next.js 15** (App Router) + TypeScript + Tailwind CSS
- **Geist Mono** — terminal aesthetic, no rounded card UI
- **Anthropic Claude** (`claude-sonnet-4-20250514`) — trade analysis
- **gold-api.com** — XAU/USD spot (no key, no rate limit)
- **yahoo-finance2** — DXY + US10Y (server-side only)
- **newsdata.io** — gold/macro news (free tier)
- **TradingView widget** — main chart (iframe)

## API routes
| Route              | Purpose                              |
| ------------------ | ------------------------------------ |
| `GET /api/price`   | XAU/USD spot, OHLC, change           |
| `GET /api/signals` | DXY + US10Y                          |
| `GET /api/news`    | Filtered gold/macro headlines        |
| `POST /api/analyze`| Claude trade analysis (bias, levels) |

Full API contracts and architecture rules live in [`.claude/context.md`](./.claude/context.md).

## Setup

```bash
# 1. Install
npm install

# 2. Configure secrets
cp .env.example .env.local
# fill in ANTHROPIC_API_KEY and NEWSDATA_API_KEY

# 3. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

```
ANTHROPIC_API_KEY=     # Claude API key
NEWSDATA_API_KEY=      # newsdata.io free tier key
```

## Trading sessions (UTC)
- **Tokyo** 00:00–07:00
- **London** 07:00–12:00
- **NY/London overlap** 12:00–16:00 — highest volatility
- **New York** 16:00–21:00
- **Off-hours** 21:00–00:00

## Status
Bootstrapped. See `.claude/context.md` for the full spec and commit log.
