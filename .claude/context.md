# Gold Trading Dashboard — Project Context

## Purpose
Personal day trading dashboard for XAU/USD. Gives the trader a live
price feed, TradingView chart, macro signals, curated gold/macro news,
and an AI-powered trade analysis (bias, key levels, entry/stop/target).
This is a local-first tool, built for daily personal use during trading
sessions. Not a commercial product.

## Stack
- Next.js 15, App Router, TypeScript, Tailwind CSS
- Geist Mono as primary font — this is a terminal, not a website
- Anthropic Claude API (claude-sonnet-4-20250514) for trade analysis
- gold-api.com for live XAU/USD price (free, no key, no rate limit)
- yahoo-finance2 npm package for DXY + US10Y (server-side only)
- newsdata.io for gold/macro news (free tier, key in .env.local)
- TradingView widget via iframe for the main chart

## Architecture rules
- All external API calls go through Next.js API routes — never
  call third-party APIs from the client directly
- Shared TypeScript types live exclusively in lib/types.ts —
  always import from there, never redefine locally
- Each component owns its own display logic, data fetching is
  handled by hooks in lib/hooks/
- .env.local holds all API keys — never hardcode, never commit
- yahoo-finance2 is server-side only — never import in client
  components or it will break the build

## Design system
- Background: #0a0a0a (page), #111111 (panels), #161616 (cards)
- Borders: #222222 (default), #2a2a2a (hover)
- Text: #e5e5e5 (primary), #888888 (muted), #444444 (tertiary)
- Bull / green: #4ade80
- Bear / red: #f87171
- Neutral / amber: #fbbf24
- Info / blue: #60a5fa
- Font: Geist Mono throughout — apply via CSS variable --font-mono
- Border radius: 4px max — this is a terminal, not a card UI
- No shadows, no gradients, no rounded card aesthetics
- Spacing unit: 8px base grid

## File structure

```
app/
  page.tsx                  — main dashboard, layout only
  api/
    price/route.ts          — fetches XAU/USD from gold-api.com
    signals/route.ts        — fetches DXY + US10Y via yahoo-finance2
    news/route.ts           — fetches from newsdata.io
    analyze/route.ts        — calls Anthropic Claude API
components/
  PriceBar.tsx              — top bar: price, change, high/low, session
  TradingViewChart.tsx      — iframe wrapper for TradingView widget
  AnalysisPanel.tsx         — AI bias, levels, entry/stop, catalyst
  SignalsPanel.tsx          — DXY, US10Y, RSI, trend, volume
  NewsFeed.tsx              — scrollable news list with impact badges
  BottomBar.tsx             — open, prev close, 52W high/low, last analysis
lib/
  types.ts                  — all shared TypeScript interfaces
  hooks/
    useGoldPrice.ts         — polls /api/price every 30s
    useSignals.ts           — polls /api/signals every 60s
    useNews.ts              — polls /api/news every 15min
    useAnalysis.ts          — calls /api/analyze, manages state
  session.ts                — trading session detection logic
  utils.ts                  — shared formatters (price, %, time)
```

## Environment variables

```
ANTHROPIC_API_KEY=          — Claude API key
NEWSDATA_API_KEY=           — newsdata.io free tier key
```

## API contracts

### GET /api/price
Returns:
```json
{
  "price": 3285.40,
  "change": 12.30,
  "changePct": 0.38,
  "high": 3301.00,
  "low": 3271.50,
  "open": 3273.10,
  "prevClose": 3273.10,
  "timestamp": 1714123456000
}
```

### GET /api/signals
Returns:
```json
{
  "dxy":  { "price": 104.23, "change": -0.12, "changePct": -0.11 },
  "us10y": { "price": 4.28, "change": 0.03, "changePct": 0.71 }
}
```

### GET /api/news
Returns:
```json
{
  "articles": [
    {
      "title": "string",
      "source": "string",
      "publishedAt": "ISO string",
      "url": "string",
      "impact": "HIGH" | "MEDIUM" | "LOW"
    }
  ]
}
```

### POST /api/analyze
Body:
```json
{
  "price": 3285.40,
  "changePct": 0.38,
  "high": 3301.00,
  "low": 3271.50,
  "dxy": 104.23,
  "us10y": 4.28,
  "session": "London",
  "news": ["headline 1", "headline 2"]
}
```
Returns:
```json
{
  "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "recommendation": "LONG" | "SHORT" | "FLAT",
  "entry": "3280-3285",
  "stop": "3265",
  "target": "3320",
  "resistance": "3305",
  "support": "3265",
  "catalyst": "string — 2-3 sentences",
  "rationale": "string — 1 sentence",
  "generatedAt": "ISO string"
}
```

## Session logic
- Tokyo:             00:00–07:00 UTC
- London:            07:00–12:00 UTC
- NY/London overlap: 12:00–16:00 UTC — highest volatility, flag this
- New York:          16:00–21:00 UTC
- Off-hours:         21:00–00:00 UTC

## News impact tagging logic
HIGH if title contains any of:
  Fed, Federal Reserve, CPI, inflation, NFP, jobs, war, sanctions,
  rate cut, rate hike, FOMC, dollar, DXY, Treasury, yield, crisis

LOW if title contains any of:
  analyst, forecast, outlook, prediction, target, expect

Everything else: MEDIUM

## Trade journal
- Stored in localStorage key: `goldDashboard_journal`
- Each entry: `{ id, direction, entry, stop, target, session, notes, exitPrice?, createdAt, closedAt? }`
- P&L: `(exitPrice - entry) * direction (1=LONG, -1=SHORT) * 100oz lot`
- Display last 10 entries

## Analysis behavior
- Manual trigger: always available via button
- Auto trigger: every 30 minutes since last analysis
- Countdown timer visible in AnalysisPanel
- Loading state: button disabled, text shows "Analyzing..."
- Last result cached in React state until page refresh

## TradingView widget config
- Symbol: XAUUSD
- Interval: 60 (1H — day trading default)
- Theme: dark
- Studies: RSI, MACD
- Locale: en
- Timezone: Europe/Paris
- Allow symbol change: false
- Hide side toolbar: false

## Commit log
- [INIT] context.md created — project fully specced, ready to build
- [#1] Next.js 15 scaffolded — clean default project, no modifications
- [#2] Dependencies installed — geist, yahoo-finance2, @anthropic-ai/sdk
- [#3] Global styles + Geist Mono font configured
- [#4] lib/types.ts created — all shared interfaces defined
- [#5] Full file structure scaffolded — all placeholders created
- [#6] Layout grid implemented — five zones rendering correctly
- [#7] API route shells with typed mocks — all four routes returning correct shapes
- [#8] lib/session.ts + lib/utils.ts implemented — helpers ready
- [#9] All four data hooks implemented — polling intervals set, loading/error states handled
- [#10] PriceBar implemented — live price, change, high/low, session, live indicator
- [#11] TradingViewChart implemented — XAUUSD 1H dark theme, RSI + MACD
- [#12] SignalsPanel implemented — DXY, US10Y, spread, session volatility
- [#13] NewsFeed implemented — articles list, impact badges, hover states, scroll
- [#14] AnalysisPanel implemented — bias, confidence, levels, catalyst, auto-trigger every 30min
- [#15] BottomBar implemented — open, prev close, change, high/low, 52W levels, timestamp
- [#16] Real gold price wired — gold-api.com, fallback on error, no caching
- [#17] Real signals wired — DXY + US10Y via yahoo-finance2, fallback on error
- [#18] Real news wired — newsdata.io, impact auto-tagging, fallback on error
- [#19] Real Claude analysis wired — structured JSON prompt, field validation, fallback on error
- [#20] Trade journal data layer — lib/journal.ts + useJournal hook, localStorage persistence
- [#21] Trade journal UI — slide-in panel, log form, entry cards, PnL, localStorage persistence
- [#22] Error states + loading skeletons — shimmer animation, graceful fallbacks in all four components
- [#23] Micro-interactions — price flash, fade-in on data load, smooth button hover transitions
- [#25] technicalindicators package installed
- [#26] Tooltip component + applied to existing labels (PriceBar, BottomBar, SignalsPanel headers; AnalysisPanel + NewsFeed pending future-UI items)
