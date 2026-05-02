// Single source of truth for every shared TypeScript type in the
// dashboard. Per the architecture rules in .claude/context.md, no
// component, hook, or API route may redefine these locally —
// always import from here. New types added later go in this file
// too; never split across multiple type files.

// ─────────────────────────────────────────────────────────────────
// Price (XAU/USD spot)
// Returned by /api/price; consumed by useGoldPrice + PriceBar.
// ─────────────────────────────────────────────────────────────────

// Provenance discriminator on every API response. Lets the UI
// surface a "DONNÉES SIMULÉES" badge when ANY data source falls
// back to mock/cached/partial data instead of silently rendering
// fake numbers as if they were live (the F-90 / security-M4
// concern). 'live' = real upstream OK; 'partial' = some fields
// computed from a fallback source (e.g. price spot from gold-api
// but OHLC missing); 'mock' = hardcoded / snapshot-derived data.
export interface ResponseMeta {
  source: 'live' | 'partial' | 'mock'
}

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
  // Optional provenance — present from the route, may be missing
  // on legacy cached responses. UI defaults to 'live' display when
  // absent.
  meta?: ResponseMeta
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
//
// [SPRINT-1] expansion — the route additionally returns three
// per-timeframe candle/indicator bundles (`tf15m`, `tf1h`, `tf4h`)
// for multi-timeframe confluence analysis, plus a `patterns` array
// of any candlestick / structure patterns detected on the latest
// candles across those timeframes. Existing consumers can keep
// reading `indicators` + `chart` unchanged; new consumers opt in
// to the multi-timeframe + pattern fields.
export interface TechnicalsResponse {
  indicators: TechnicalIndicators
  chart: ChartSeries

  // Multi-timeframe candle bundles — one per timeframe Claude can
  // reason over when scoring confluence. See TimeframeCandles.
  // Optional during the [SPRINT-1] types-only landing so the
  // existing /api/technicals route still type-checks; [SPRINT-2]
  // populates them and consumers can rely on their presence.
  tf15m?: TimeframeCandles
  tf1h?: TimeframeCandles
  tf4h?: TimeframeCandles

  // Candlestick + structure patterns detected server-side across
  // the timeframes above. Empty array when nothing fires; absent
  // during the [SPRINT-1] types-only landing (see note above).
  patterns?: DetectedPattern[]
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

  // [PHASE-2] Weighted confluence — granular score 0..max derived
  // from the same 8 signals as confluenceScore but with per-signal
  // weights (trend dominates, calendar/news under-weighted).
  // Server-computed via lib/scoring.ts; legacy confluenceScore is
  // still populated for backward compatibility with stored history
  // records that pre-date this field.
  weightedConfluence?: WeightedConfluenceSummary

  // [PHASE-2] Detected named setup. null when no detector scored
  // above the confidence threshold; the analysis remains valid in
  // that case and the UI just hides the setup chip. See lib/setups.ts.
  detectedSetup?: SetupName | null
}

// [PHASE-2] Trimmed view of the WeightedConfluence object from
// lib/scoring.ts — kept on AnalysisResult so stored history
// records carry the same payload. Mirrors the runtime shape but
// without re-importing the lib/scoring module from types.ts.
export interface WeightedConfluenceSummary {
  score: number              // 0..max, rounded to 1 decimal
  max: number                // total of all weights, currently 10.0
  dominant: Bias             // direction that won the weighted vote
  bullishWeight: number      // raw bullish total
  bearishWeight: number      // raw bearish total
}

// [PHASE-2] Closed set of named setups the detector knows about.
// Adding a new setup here also requires updating DETECTORS in
// lib/setups.ts and displaySetupName().
export type SetupName =
  | 'LONDON_FALSE_BREAK'
  | 'LONDON_CONTINUATION'
  | 'NY_OVERLAP_TREND'
  | 'FOMC_FADE'
  | 'ASIAN_RANGE_BREAKOUT'
  | 'EMA20_PULLBACK'

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

  // [SPRINT-4] Multi-timeframe context. Compact scalar reads from
  // the 15M and 4H bundles in TechnicalsResponse. Sent on every
  // analyze request so Claude can apply the multi-TF playbook
  // (4H = trend filter, 1H = setup, 15M = entry timing). String
  // fields are kept loose (`string`) rather than the strong unions
  // because the route emits the values verbatim from the
  // per-TF bundle, which uses plain strings.
  tf15m: {
    trend: string
    rsi: number
    rsiZone: string
    macdHistogram: number
    macdCross: string
    ema20: number
    ema50: number
    priceVsEma20: string
  }
  tf4h: {
    trend: string
    rsi: number
    rsiZone: string
    macdHistogram: number
    macdCross: string
    ema20: number
    ema50: number
    priceVsEma20: string
  }

  // [SPRINT-4] Detected candlestick + structure patterns flowing
  // from the server's pattern detector. Empty array when no
  // patterns fire; Claude's prompt explicitly handles that case.
  detectedPatterns: {
    pattern: string
    timeframe: string
    direction: string
    significance: string
    description: string
  }[]

  // [SPRINT-7] Personal performance context — derived from the
  // trader's analysis history (lib/history.ts → PersonalPatterns).
  // Sent on every analyze request so Claude can calibrate its
  // recommendation against how this specific trader has actually
  // performed in the current session / at the current confluence
  // score / overall.
  //
  // hasData = false when there aren't yet enough decided
  // outcomes (< 5) — the system prompt tells Claude to ignore
  // every other field in that case. We still send the section
  // so the message format stays consistent run-to-run.
  //
  // currentSessionAccuracy / currentConfluenceAccuracy are null
  // when the trader has no decided outcomes in that specific
  // bucket yet — distinct from "0%" which would mislead Claude.
  personalPatterns: {
    hasData: boolean
    totalOutcomes: number
    overallAccuracy: number
    bestSession: string | null
    bestConfluenceThreshold: number | null
    currentSessionAccuracy: number | null
    currentConfluenceAccuracy: number | null
    insight: string
  }
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

// ─────────────────────────────────────────────────────────────────
// [SPRINT-1] Multi-timeframe candles
// Added to power the upcoming 15M/1H/4H confluence engine and chart
// switcher. /api/technicals will fetch all three timeframes in
// parallel; the chart component will toggle between them.
// ─────────────────────────────────────────────────────────────────

// The three timeframes the dashboard reasons over. 15M is for
// entry-timing precision, 1H is the primary trade-direction view
// (matches existing TechnicalIndicators snapshot), 4H is the broad
// trend filter. Anything else (1D, 5M) is intentionally out of
// scope — keep the surface small.
export type Timeframe = '15M' | '1H' | '4H'

// Convenient alias used by per-timeframe series fields below. The
// shape is identical to ChartLinePoint (the existing 1H series
// type); we keep both names so the timeframe API reads naturally
// (`ema20Series: ChartSeriesPoint[]`) without forcing existing
// callers of ChartLinePoint to rename.
export type ChartSeriesPoint = ChartLinePoint

// One full bundle of candles + EMA series + scalar indicator
// snapshot for a single timeframe. Server fills these per-TF in
// /api/technicals; the client picks the active one based on the
// chart switcher state. Indicator fields are typed as `string` /
// `number` here (not the strong unions like Trend/RsiZone) on
// purpose — the multi-TF detector emits those values as plain
// strings for forward compatibility, and consumers narrow when
// they care.
export interface TimeframeCandles {
  timeframe: Timeframe
  candles: ChartCandle[]            // raw OHLCV for this TF
  ema20Series: ChartSeriesPoint[]   // aligned to candle timestamps
  ema50Series: ChartSeriesPoint[]   // aligned to candle timestamps

  // Scalar values trader-friendly to read at a glance — also fed
  // into the multi-TF confluence prompt later in the sprint.
  indicators: {
    ema20: number
    ema50: number
    rsi: number
    macd: number
    macdHistogram: number
    macdCross: string               // 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NONE'
    trend: string                   // 'UPTREND' | 'DOWNTREND' | 'RANGING'
    rsiZone: string                 // 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL'
  }
}

// ─────────────────────────────────────────────────────────────────
// [SPRINT-1] Pattern detection
// Server-side detector flags candlestick + structure patterns on
// the latest candles of each timeframe. The chart renders these as
// markers; the analyze prompt cites them as confluence inputs.
// ─────────────────────────────────────────────────────────────────

// Closed set of patterns the detector currently knows about.
// Singles are 1-candle (HAMMER, DOJI, MARUBOZU). Pairs are
// 2-candle (ENGULFING, INSIDE_BAR). Structure patterns scan the
// last N candles (HH/HL, LH/LL, DOUBLE_TOP/BOTTOM).
export type PatternName =
  | 'BULLISH_ENGULFING'
  | 'BEARISH_ENGULFING'
  | 'HAMMER'
  | 'SHOOTING_STAR'
  | 'INSIDE_BAR'
  | 'BULLISH_MARUBOZU'
  | 'BEARISH_MARUBOZU'
  | 'DOJI'
  | 'HIGHER_HIGH_HIGHER_LOW'
  | 'LOWER_HIGH_LOWER_LOW'
  | 'DOUBLE_TOP_FORMING'
  | 'DOUBLE_BOTTOM_FORMING'

// Directional read of a pattern for gold. NEUTRAL covers
// compression / indecision patterns (INSIDE_BAR, DOJI) where
// direction is "pending breakout" rather than committed.
export type PatternDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

// How much weight the trader should put on this pattern. HIGH for
// strong reversal / continuation signals (engulfing, hammer,
// HH/HL), MEDIUM for compression (inside bar, doji), LOW reserved
// for future weak signals.
export type PatternSignificance = 'HIGH' | 'MEDIUM' | 'LOW'

// One detected pattern instance. `detectedAt` is ISO 8601 (when
// the server observed it, not the candle timestamp). `description`
// is human-readable copy used in tooltips and the analyze prompt
// — e.g. "Bullish engulfing on 4H — strong reversal candle".
export interface DetectedPattern {
  pattern: PatternName
  timeframe: Timeframe
  direction: PatternDirection
  significance: PatternSignificance
  description: string
  detectedAt: string                // ISO 8601
}

// ─────────────────────────────────────────────────────────────────
// [SPRINT-1] Analysis history + personal pattern stats
// Persisted record of every analysis the trader runs, plus the
// follow-up outcome checks at +2H and +4H. Drives the personal
// pattern dashboard ("you're 72% accurate in NY/London overlap").
// ─────────────────────────────────────────────────────────────────

// What actually happened to the trade idea after the analysis was
// generated. HIT_TARGET / HIT_STOP are terminal; OPEN means still
// running; INCONCLUSIVE means neither level hit within the check
// window (price drifted sideways).
export type TradeOutcome =
  | 'HIT_TARGET'
  | 'HIT_STOP'
  | 'OPEN'
  | 'INCONCLUSIVE'

// One full historical record of an analysis run. Created on every
// /api/analyze success; the +2H / +4H fields are filled in later
// by a follow-up checker that compares price action to the
// recorded entry/stop/target. All outcome fields are optional so
// fresh records (still inside the 2H window) are valid.
export interface AnalysisHistoryRecord {
  id: string                        // uuid — stable key
  generatedAt: string               // ISO 8601 — matches AnalysisResult
  priceAtAnalysis: number           // spot at the moment of analysis

  // Snapshot of the analysis itself — all fields mirror
  // AnalysisResult so we can rebuild a card from history alone.
  bias: Bias
  confidence: Confidence
  recommendation: Recommendation
  confluenceScore: number
  confluenceTotal: number
  session: string                   // session name at analysis time
  entryType: EntryType
  marketCondition: MarketCondition
  entry: string
  stop: string
  target: string
  invalidationLevel: string
  riskReward: string

  // [PHASE-2] Setup name + weighted score copied from the
  // AnalysisResult so MEMORY tab can group by setup and Phase 6
  // (rehearsal) can compute "last N similar setups" without
  // re-running detection.
  detectedSetup?: SetupName | null
  weightedConfluence?: WeightedConfluenceSummary

  // [LEGACY] Point-in-time outcome tracking. Kept on existing
  // records for backward compatibility but no longer written for
  // new records — the path-based replay below replaces it. See
  // [PHASE-1] notes for the false-positive bug this caused.
  priceAt2H?: number
  priceAt4H?: number
  checkedAt2H?: string              // ISO 8601
  checkedAt4H?: string              // ISO 8601
  outcome2H?: TradeOutcome
  outcome4H?: TradeOutcome

  // [PHASE-1] Path-based replay outcome.
  //
  // Computed by walking 5-min candles between generatedAt and
  // generatedAt+4H and recording which level was wick-touched
  // FIRST. Replaces the legacy outcome2H/outcome4H point-in-time
  // check, which produced false positives whenever price hit the
  // stop and then mean-reverted to the target before +4H.
  //
  // hitOutcome is the source of truth going forward. Records that
  // pre-date this fix carry legacyOutcome=true and are excluded
  // from calibration math via getDecidedOutcome / computeCalibration.
  hitAt?: string                    // ISO 8601 — first candle that touched stop or target
  hitOutcome?: TradeOutcome         // path-based classification
  pathMaxFavorable?: number         // best price reached in window for the trade direction
  pathMaxAdverse?: number           // worst price reached (drawdown) for the trade direction
  replayCheckedAt?: string          // ISO 8601 — when the replay last ran for this record
  replayCandleCount?: number        // how many 5m candles were consumed (forensics)

  // Pre-fix records — outcome2H/4H present but produced by the
  // broken classifier. Tagged once at module load by
  // migrateLegacyTags() and filtered out of every accuracy
  // surface. Do not re-set on records with hitOutcome populated.
  legacyOutcome?: boolean
}

// Aggregate stats computed from AnalysisHistoryRecord[]. Drives
// the "personal patterns" panel: overall accuracy + breakdowns by
// session / confluence score / entry type, plus a single insight
// string the UI renders verbatim ("Best results: NY/London
// overlap with confluence ≥ 6 — 78% accuracy").
//
// Sub-buckets share the same shape: `count` analyses tracked,
// `accurate` (HIT_TARGET) wins, `accuracy` as a 0-100 percentage
// for direct rendering.
export interface PersonalPatterns {
  totalAnalyses: number             // every record, including OPEN
  totalWithOutcome: number          // only records with terminal outcome
  overallAccuracy: number           // 0-100, HIT_TARGET / totalWithOutcome

  // Breakdown by session at analysis time (Tokyo, London, ...).
  bySession: Record<string, {
    count: number
    accurate: number
    accuracy: number
  }>

  // Breakdown by confluenceScore bucket (0..confluenceTotal).
  byConfluenceScore: Record<number, {
    count: number
    accurate: number
    accuracy: number
  }>

  // Breakdown by EntryType (IDEAL, AGGRESSIVE, WAIT).
  byEntryType: Record<string, {
    count: number
    accurate: number
    accuracy: number
  }>

  // Top-line insights — null when there isn't enough data yet.
  bestSession: string | null
  bestConfluenceThreshold: number | null

  // One-sentence rendered summary for the UI banner. Computed
  // server-side so the client doesn't reinvent the heuristic.
  insight: string
}

// ─────────────────────────────────────────────────────────────────
// [SPRINT-1] Session briefing
// Pre-session AI-written summary the trader reads before the bell.
// Generated once per session per day; persisted so reopening the
// dashboard mid-session shows the same briefing.
// ─────────────────────────────────────────────────────────────────

// Body of the briefing — five plain-text fields the UI renders as
// stacked sections, plus a directional read so the briefing card
// can show a bias chip at a glance.
export interface SessionBriefingContent {
  overnightSummary: string          // what moved while you were away
  keyLevels: string                 // resistance + support to watch
  calendarRisk: string              // upcoming HIGH-impact events
  sessionBias: string               // expected directional pressure
  watchFor: string                  // specific catalysts / triggers
  bias: Bias
  confidence: Confidence
}

// Wrapper persisted in localStorage, keyed by `${date}_${session}`.
// `date` is YYYY-MM-DD UTC so day rollover is unambiguous across
// timezones; `session` is the SessionName as a string.
export interface SessionBriefing {
  id: string                        // uuid — stable key
  date: string                      // YYYY-MM-DD UTC
  session: string                   // SessionName at briefing time
  generatedAt: string               // ISO 8601 — when AI wrote it
  content: SessionBriefingContent
}

// ─────────────────────────────────────────────────────────────────
// [SPRINT-1] Invalidation alerts
// When live price crosses an analysis's invalidationLevel the
// dashboard fires an alert toast/banner so the trader doesn't
// keep acting on a thesis that's already broken.
// ─────────────────────────────────────────────────────────────────

// WARNING fires as price approaches invalidation; CRITICAL fires
// when it actually crosses. Both share the same banner shape and
// can be dismissed independently.
export type AlertSeverity = 'WARNING' | 'CRITICAL'

// One invalidation alert event. `analysisId` links back to the
// AnalysisHistoryRecord that generated the level so the UI can
// jump to the original card. `dismissed` flips true when the
// trader closes the banner — persisted so the alert doesn't
// re-show on next page load.
export interface InvalidationAlert {
  id: string                        // uuid
  triggeredAt: string               // ISO 8601
  severity: AlertSeverity
  message: string                   // human-readable banner copy
  priceAtTrigger: number            // spot when the alert fired
  analysisId: string                // FK → AnalysisHistoryRecord.id
  dismissed: boolean
}

// ─────────────────────────────────────────────────────────────────
// [SPRINT-1] Confidence calibration
// Stats that answer "when Claude says HIGH confidence, how often
// is it right?". Drives a small calibration card in the Copilot
// footer once enough outcomes have been recorded.
// ─────────────────────────────────────────────────────────────────

// Per-bucket accuracy. `null` for a bucket means we don't have
// any outcomes in that band yet (don't render a number that
// would be 0/0). `isCalibrated` gates whether the UI shows the
// card at all — below the threshold the sample is too small to
// be meaningful.
export interface ConfidenceCalibration {
  totalRecords: number              // every history record
  recordsWithOutcome: number        // records with terminal outcome
  highConfidenceAccuracy: number | null     // 0-100 or null
  mediumConfidenceAccuracy: number | null
  lowConfidenceAccuracy: number | null
  isCalibrated: boolean             // true once recordsWithOutcome >= 10
  lastUpdated: string               // ISO 8601 — last recompute
}
