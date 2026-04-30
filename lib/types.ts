// Single source of truth for every shared TypeScript type in the
// dashboard. Per the architecture rules in .claude/context.md, no
// component, hook, or API route may redefine these locally —
// always import from here. New types added later go in this file
// too; never split across multiple type files.

// ─────────────────────────────────────────────────────────────────
// Price (XAU/USD spot)
// Returned by /api/price; consumed by useGoldPrice + PriceBar.
// ─────────────────────────────────────────────────────────────────

// One snapshot of the gold market: latest tick + daily OHLC + the
// previous close. `change` and `changePct` are vs. `prevClose`.
// `timestamp` is ms since epoch (matches Date.now()).
export interface GoldPrice {
  price: number       // current XAU/USD spot price, USD per ounce
  change: number      // absolute move vs. prevClose (signed)
  changePct: number   // percent move vs. prevClose (signed, e.g. 0.38 = +0.38%)
  high: number        // session high so far (USD)
  low: number         // session low so far  (USD)
  open: number        // session open (USD)
  prevClose: number   // previous session close (USD)
  timestamp: number   // ms epoch — when this snapshot was taken
}

// ─────────────────────────────────────────────────────────────────
// Macro signals (DXY + US10Y)
// Returned by /api/signals; consumed by useSignals + SignalsPanel.
// ─────────────────────────────────────────────────────────────────

// One macro instrument quote — same shape for DXY and US10Y so the
// SignalsPanel can render both with one component.
export interface SignalItem {
  price: number       // index level (DXY) or yield in % (US10Y)
  change: number      // absolute move vs. prev close
  changePct: number   // percent move vs. prev close
}

// Bundled macro signals payload from /api/signals.
export interface MarketSignals {
  dxy: SignalItem     // US Dollar Index — inverse to gold most days
  us10y: SignalItem   // US 10-Year Treasury yield (%)
}

// ─────────────────────────────────────────────────────────────────
// News
// Returned by /api/news; consumed by useNews + NewsFeed.
// ─────────────────────────────────────────────────────────────────

// Headline-impact bucket — drives the colored badge in NewsFeed and
// the news[] payload sent to /api/analyze. Tagging logic (which
// keywords map to which level) lives in lib/utils.ts, not here.
export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW'

// One curated article. `publishedAt` is ISO 8601, `url` is the
// canonical source link, `source` is the human-readable outlet name.
export interface NewsArticle {
  title: string
  source: string
  publishedAt: string // ISO 8601 — parse with new Date(...) when sorting
  url: string
  impact: ImpactLevel
}

// Top-level shape of the /api/news response.
export interface NewsResponse {
  articles: NewsArticle[]
}

// ─────────────────────────────────────────────────────────────────
// Analysis (Claude-generated trade idea)
// Returned by POST /api/analyze; consumed by useAnalysis + AnalysisPanel.
// ─────────────────────────────────────────────────────────────────

// Directional read of the market — the headline of an analysis.
export type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

// How sure Claude is — informs the visual weight of the bias badge
// and whether the trader should act on the recommendation.
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

// Concrete action suggestion: enter long, enter short, or stay flat.
// FLAT means "no trade" (e.g. NEUTRAL bias or LOW confidence).
export type Recommendation = 'LONG' | 'SHORT' | 'FLAT'

// One full analysis result. Levels (entry/stop/target/resistance/
// support) are kept as strings so the model can emit ranges like
// "3280-3285" or notes like "above 3300" without us forcing a
// number parse on the client.
export interface AnalysisResult {
  bias: Bias
  confidence: Confidence
  recommendation: Recommendation
  entry: string       // suggested entry zone, e.g. "3280-3285"
  stop: string        // protective stop level, e.g. "3265"
  target: string      // profit target, e.g. "3320"
  resistance: string  // nearest overhead resistance
  support: string     // nearest underlying support
  catalyst: string    // 2–3 sentences — what is driving this view
  rationale: string   // 1 sentence — why this entry/stop/target
  generatedAt: string // ISO 8601 timestamp from the server
}

// Inputs Claude needs to produce an AnalysisResult. The dashboard
// assembles this from current price + signals + session + recent
// news headlines, then POSTs to /api/analyze.
export interface AnalysisRequest {
  price: number       // latest XAU/USD spot
  changePct: number   // session change (matches GoldPrice.changePct)
  high: number        // session high
  low: number         // session low
  dxy: number         // current DXY index level
  us10y: number       // current US10Y yield (%)
  session: string     // active trading session (matches SessionName)
  news: string[]      // recent headline strings, freshest first
}

// ─────────────────────────────────────────────────────────────────
// Trading session
// Computed client-side in lib/session.ts from the current UTC time;
// consumed by PriceBar + AnalysisPanel + the analyze request body.
// ─────────────────────────────────────────────────────────────────

// Discriminated set of named sessions. Times (UTC) and the
// `isHighVolatility` flag for "NY/London Overlap" are documented in
// .claude/context.md under "Session logic".
export type SessionName =
  | 'Tokyo'
  | 'London'
  | 'NY/London Overlap'
  | 'New York'
  | 'Off-hours'

// Current session + whether the trader should expect elevated
// volatility (true only for the NY/London overlap window).
export interface TradingSession {
  name: SessionName
  isHighVolatility: boolean
}

// ─────────────────────────────────────────────────────────────────
// Trade journal (localStorage)
// Persisted under `goldDashboard_journal`; managed by the journal
// component (not yet built). Entries flow LONG → exitPrice → P&L.
// ─────────────────────────────────────────────────────────────────

// Direction of the trade — used as the multiplier in P&L math:
// (exit - entry) * (LONG ? 1 : -1) * 100 (oz lot per .claude/context.md).
export type TradeDirection = 'LONG' | 'SHORT'

// One journaled trade. While the trade is open, `exitPrice` and
// `closedAt` are undefined; once closed, both are set and the entry
// becomes a complete historical record.
export interface JournalEntry {
  id: string                  // uuid/random — stable key for React lists
  direction: TradeDirection
  entry: number               // execution price (USD)
  stop: number                // protective stop (USD)
  target: number              // profit target (USD)
  session: string             // name of session at trade open
  notes: string               // free-form trader notes
  exitPrice?: number          // set on close
  createdAt: string           // ISO 8601 — when the trade was opened
  closedAt?: string           // ISO 8601 — set on close
}
