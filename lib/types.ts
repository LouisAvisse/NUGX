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
// Technical indicators (computed from 1H candle history)
// Returned by /api/technicals; consumed by useTechnicals +
// SignalsPanel TECHNICAL section + AnalysisRequest body.
// ─────────────────────────────────────────────────────────────────

// MACD cross state observed across the last few candles.
// 'NONE' is the default when neither cross has happened recently.
export type MacdCross = 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NONE'

// 1H trend classification derived from EMA20 vs EMA50 alignment
// (and price). Used for the TREND row in SignalsPanel and the
// `trend` confluence signal in /api/analyze.
export type Trend = 'UPTREND' | 'DOWNTREND' | 'RANGING'

// RSI zone bucket — drives the OB / OS badge in SignalsPanel and
// the `momentum` confluence signal.
export type RsiZone = 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL'

// Where current price sits relative to a moving average.
export type PriceVsEma = 'ABOVE' | 'BELOW'

// Full snapshot of every indicator the dashboard reads. Computed
// server-side from candle history in /api/technicals; the client
// hook just polls and exposes this object directly.
export interface TechnicalIndicators {
  // Exponential moving averages (1H)
  ema20: number
  ema50: number
  ema200: number

  // Momentum
  rsi: number              // 0..100
  rsiZone: RsiZone

  // MACD (12, 26, 9 standard)
  macd: number             // MACD line value
  macdSignal: number       // signal line value
  macdHistogram: number    // histogram = macd - signal
  macdCross: MacdCross     // recent cross state

  // Volatility / range
  atr: number              // 14-period Average True Range, in USD
  bbUpper: number          // Bollinger upper band (20, 2σ)
  bbLower: number          // Bollinger lower band (20, 2σ)

  // Recent structure
  swingHigh: number        // highest high over last 20 candles
  swingLow: number         // lowest low  over last 20 candles

  // Derived classifications
  trend: Trend
  dayRangePct: number      // 0..100 — where current price sits in
                           // today's high-low range
  priceVsEma20: PriceVsEma
  priceVsEma50: PriceVsEma
  priceVsEma200: PriceVsEma
}

// ─────────────────────────────────────────────────────────────────
// Chart series + AI levels
// Consumed by GoldChart (components/TradingViewChart.tsx) — the
// Lightweight Charts panel. Series ship from /api/technicals so
// the heavy `technicalindicators` package never enters the
// browser bundle. AI levels flow from AnalysisPanel up to page.tsx
// then back down into GoldChart as horizontal price lines.
// ─────────────────────────────────────────────────────────────────

// One OHLCV candle in Lightweight Charts' expected shape.
// `time` is a UTC timestamp in seconds since epoch (the library's
// UTCTimestamp form). `volume` is included for the histogram
// series at the bottom of the price panel.
export interface ChartCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// One point on a line series (EMA20/50/200). Uses the same time
// format as ChartCandle so price + EMA series share an X axis.
export interface ChartLinePoint {
  time: number
  value: number
}

// Bundled chart payload — raw candle history + the three EMA
// overlays computed server-side. The client never recomputes
// indicators; it just renders what arrives.
export interface ChartSeries {
  candles: ChartCandle[]
  ema20: ChartLinePoint[]
  ema50: ChartLinePoint[]
  ema200: ChartLinePoint[]
}

// Top-level shape of the /api/technicals response — indicators
// snapshot + chart series for the GoldChart component.
// (Pre-[#50] the route returned the indicators object directly;
// the hook + route were updated together.)
export interface TechnicalsResponse {
  indicators: TechnicalIndicators
  chart: ChartSeries
}

// AI levels overlaid on the GoldChart as horizontal price lines.
// All fields optional — the chart redraws on every `levels` prop
// change and only renders lines for fields that resolve to a
// finite number greater than zero.
//
// Populated by AnalysisPanel after every successful analysis run:
// entry/stop/target/resistance/support are parsed from the model's
// string output (e.g. "3281-3284" → 3281), while swingHigh /
// swingLow piggyback off useTechnicals so the chart can show
// recent structure even before the first analysis fires.
export interface ChartLevels {
  entry?: number
  stop?: number
  target?: number
  resistance?: number
  support?: number
  swingHigh?: number
  swingLow?: number
}

// ─────────────────────────────────────────────────────────────────
// News
// Returned by /api/news; consumed by useNews + NewsFeed.
// ─────────────────────────────────────────────────────────────────

// Headline-impact bucket — drives the colored badge in NewsFeed and
// the news[] payload sent to /api/analyze. Tagging logic (which
// keywords map to which level) lives in lib/utils.ts, not here.
export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW'

// Directional sentiment of a headline for gold. Computed by a
// keyword tagger in /api/news. BULLISH for war / sanctions /
// Fed-dovish / rate cut / dollar weak, BEARISH for rate hike /
// dollar strong / yield rise, NEUTRAL otherwise.
export type NewsSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

// One curated article. `publishedAt` is ISO 8601, `url` is the
// canonical source link, `source` is the human-readable outlet name.
// `sentiment` is optional during the rollout — older payloads (mock
// or unupgraded /api/news responses) won't include it.
export interface NewsArticle {
  title: string
  source: string
  publishedAt: string // ISO 8601 — parse with new Date(...) when sorting
  url: string
  impact: ImpactLevel
  sentiment?: NewsSentiment
}

// Top-level shape of the /api/news response.
export interface NewsResponse {
  articles: NewsArticle[]
}

// ─────────────────────────────────────────────────────────────────
// Economic calendar (ForexFactory feed)
// Returned by /api/calendar; consumed by useCalendar +
// CalendarPanel. The calendar drives the "clear to trade" gate in
// the AnalysisPanel — never enter a new trade within 45 minutes
// of a HIGH-impact event.
// ─────────────────────────────────────────────────────────────────

// HIGH/MEDIUM/LOW per ForexFactory's classification.
// We filter LOW out before returning, so callers normally only
// see HIGH and MEDIUM, but the union admits LOW for completeness.
export type EventImpact = 'HIGH' | 'MEDIUM' | 'LOW'

// One scheduled economic release. `minutesUntil` is computed
// server-side at fetch time and goes negative once the event has
// passed. `isUpcoming` is the convenient boolean form.
export interface EconomicEvent {
  title: string         // e.g. "CPI m/m"
  country: string       // e.g. "USD" / "EUR" — for the country badge
  date: string          // ISO 8601
  impact: EventImpact
  forecast: string      // market consensus, "—" if unknown
  previous: string      // last release value, "—" if unknown
  isUpcoming: boolean   // true iff event is in the future
  minutesUntil: number  // negative when isUpcoming === false
}

// Top-level /api/calendar response shape.
export interface CalendarResponse {
  events: EconomicEvent[]
  nextHighImpact: EconomicEvent | null  // earliest upcoming HIGH
  clearToTrade: boolean                 // false iff a HIGH is < 45m away
  warningMessage: string | null         // human-readable banner copy
}

// ─────────────────────────────────────────────────────────────────
// Analysis (Claude-generated trade idea)
// Returned by POST /api/analyze; consumed by useAnalysis +
// AnalysisPanel. AnalysisRequest is everything the model needs
// to produce a high-confluence trade decision; AnalysisResult
// is the structured output the panel renders.
// ─────────────────────────────────────────────────────────────────

// Directional read of the market — the headline of an analysis.
export type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

// How sure Claude is — informs the visual weight of the bias badge
// and whether the trader should act on the recommendation.
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

// Concrete action suggestion: enter long, enter short, or stay flat.
// FLAT means "no trade" (e.g. NEUTRAL bias or LOW confidence).
export type Recommendation = 'LONG' | 'SHORT' | 'FLAT'

// Per-signal direction breakdown — Claude scores each of the 8
// confluence signals as BULLISH / BEARISH / NEUTRAL for gold and
// returns this object so the AnalysisPanel can render the dot grid.
export interface SignalBreakdown {
  trend: Bias       // EMA20/50 alignment + price structure
  momentum: Bias    // RSI zone + slope
  macd: Bias        // histogram direction + recent cross
  dxy: Bias         // DXY direction (gold inverse-correlated)
  us10y: Bias       // US10Y yield direction (gold inverse)
  session: Bias     // current session quality + volatility
  news: Bias        // bullish vs bearish headline count
  calendar: Bias    // clear-to-trade flag
}

// Entry-quality classification — the panel renders this as the
// IDEAL / AGGRESSIVE / WAIT badge in the recommendation block.
export type EntryType = 'IDEAL' | 'AGGRESSIVE' | 'WAIT'

// Market-condition tag — drives the badge in the COPILOT header
// and is part of the trader's at-a-glance read.
export type MarketCondition =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'BREAKOUT_WATCH'

// One full analysis result. Levels (entry/stop/target/resistance/
// support/invalidationLevel) are kept as strings so the model can
// emit ranges like "3280-3285" or notes like "above 3300" without
// forcing a number parse on the client.
//
// Confluence scoring fields (`confluenceScore`, `confluenceTotal`,
// `signals`) come from the [#27] confluence-engine prompt rebuild;
// `entryType`, `invalidationLevel`, `marketCondition` are from
// the Marcus Reid review prompt. Old /api/analyze responses (or
// FALLBACK during outages) supply safe defaults for all of these.
export interface AnalysisResult {
  bias: Bias
  confidence: Confidence
  recommendation: Recommendation
  entry: string              // suggested entry zone, e.g. "3280-3285"
  stop: string               // protective stop level
  target: string             // profit target
  resistance: string         // nearest overhead resistance
  support: string            // nearest underlying support
  catalyst: string           // 2–3 sentences OR NOW/RISK/TRIGGER format
  rationale: string          // 1 sentence — why this entry/stop/target
  generatedAt: string        // ISO 8601 — set server-side, not by Claude

  // Confluence engine (set by [#27] rebuild)
  confluenceScore: number    // 0..confluenceTotal — bullish OR bearish wins
  confluenceTotal: number    // currently 8 (one per signal in the breakdown)
  signals: SignalBreakdown
  holdTime: string           // e.g. "1-3 hours"
  riskReward: string         // e.g. "1:2.4"
  entryTiming: string        // sentence explaining when to fire
  exitPlan: string           // pre-event exit plan or take-profit ladder

  // Marcus Reid review additions
  entryType: EntryType
  invalidationLevel: string  // price string — thesis breaks beyond this
  marketCondition: MarketCondition
}

// Inputs Claude needs to produce an AnalysisResult. The dashboard
// assembles this from current price + technicals + macro signals +
// session + calendar + news, then POSTs to /api/analyze.
//
// Originally this was an 8-field summary; the confluence engine
// expanded it to a complete market snapshot so the model has
// everything it needs to score 8 signals without guessing.
export interface AnalysisRequest {
  // Price (matches GoldPrice fields, plus open)
  price: number
  changePct: number
  high: number
  low: number
  open: number

  // Technical indicators (from useTechnicals → /api/technicals)
  ema20: number
  ema50: number
  ema200: number
  rsi: number
  macd: number
  macdSignal: number
  macdHistogram: number
  macdCross: MacdCross
  atr: number
  bbUpper: number
  bbLower: number
  swingHigh: number
  swingLow: number
  trend: Trend
  rsiZone: RsiZone
  dayRangePct: number
  priceVsEma20: PriceVsEma
  priceVsEma50: PriceVsEma
  priceVsEma200: PriceVsEma

  // Macro (from useSignals → /api/signals)
  dxy: number
  dxyChangePct: number
  us10y: number
  us10yChangePct: number

  // Session (from getCurrentSession)
  session: string
  sessionIsHighVolatility: boolean

  // Calendar (from useCalendar → /api/calendar)
  clearToTrade: boolean
  warningMessage: string | null
  nextEventTitle: string | null
  nextEventMinutes: number | null

  // News sentiment + top headlines (from useNews → /api/news)
  newsBullishCount: number
  newsBearishCount: number
  newsNeutralCount: number
  topHeadlines: string[]
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
// Persisted under `goldDashboard_journal`; managed by JournalPanel.
// Entries flow LONG → exitPrice → P&L.
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
