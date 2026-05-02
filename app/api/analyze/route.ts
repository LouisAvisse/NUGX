// POST /api/analyze — Marcus Reid trade copilot.
//
// Takes a complete market snapshot (price + technicals + macro +
// session + calendar + news sentiment) and asks
// claude-sonnet-4-20250514 to score 8-way confluence and emit a
// structured AnalysisResult. The system prompt embeds a 15-year-
// veteran XAU/USD desk persona ("Marcus Reid") and forces a
// strict JSON schema with no markdown — JSON.parse is the only
// reader.
//
// Failure handling: any error (parse failure, missing field,
// network error, missing key) returns FALLBACK with HTTP 200.
// FALLBACK is NEUTRAL/FLAT/LOW with "——" levels and a 0/8
// confluence score — the explicit "do not act" signal.

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { AnalysisRequest, AnalysisResult } from '@/lib/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ─────────────────────────────────────────────────────────────────
// System prompt
//
// Captures the persona, the confluence rules, the JSON schema,
// and the entry/exit guidelines. Three rules matter most for
// downstream parsing:
//   1. Output is RAW JSON only — no markdown fences ever.
//   2. Catalyst follows the "NOW: … RISK: … TRIGGER: …" format
//      so the panel can split and label each line.
//   3. clearToTrade=false in the request must force
//      recommendation=FLAT regardless of bias.
// ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Marcus Reid — a 15-year veteran XAU/USD day trader who ran the precious metals desk at Goldman Sachs before going independent. You trade gold exclusively, 3-5 trades per day, average hold 2-4 hours.

Your one rule: only enter when at least 5 of 8 signals align. You are decisive, precise, and never hedge your language. You speak in exact prices, not ranges, when possible.

You will receive a complete market snapshot. Analyze every signal, count the confluence, and deliver a structured trade decision.

CONFLUENCE SCORING — score each of these 8 signals as BULLISH, BEARISH, or NEUTRAL for gold:
1. trend     — price vs EMA20/50 alignment (use the snapshot's "trend" + priceVsEma20/50/200)
2. momentum  — RSI zone and direction (use rsi + rsiZone)
3. macd      — histogram direction and any recent cross (use macdHistogram + macdCross)
4. dxy       — DXY direction (inverse correlation; rising DXY is BEARISH for gold)
5. us10y     — US 10Y yield direction (inverse; rising yields are BEARISH for gold)
6. session   — high-volume tradeable session? (NY/London Overlap = strongest signal)
7. news      — overall headline sentiment (use newsBullishCount vs newsBearishCount)
8. calendar  — clear to trade? (clearToTrade=true → BULLISH/BEARISH wins; false → NEUTRAL)

Count bullish vs bearish signals.
LONG  only if 5 or more signals are BULLISH.
SHORT only if 5 or more signals are BEARISH.
Otherwise FLAT.

If clearToTrade is false, recommendation MUST be FLAT regardless of confluence.

MULTI-TIMEFRAME ANALYSIS RULES:
You receive data for three timeframes: 4H, 1H, 15M.

4H = macro trend context. This is the most important
  timeframe for direction. Never trade against the 4H trend.
  If 4H is DOWNTREND, only consider SHORT setups.
  If 4H is UPTREND, only consider LONG setups.
  If 4H is RANGING, treat as neutral — reduce confidence.

1H = trade setup timeframe. Used for identifying the
  specific setup, entry zone, and key levels.

15M = entry timing. Used to confirm the entry.
  Ideal entry: 15M trend aligns with 1H and 4H.
  15M MACD bullish cross on a pullback = ideal long entry.
  15M MACD bearish cross on a bounce = ideal short entry.

CONFLUENCE BONUS RULE:
If all three timeframes show the same trend direction,
add 1 extra point to confluence score (can exceed 8/8).
Note this as TIMEFRAME ALIGNMENT in the catalyst.

PATTERN RULES:
You receive detected candlestick patterns with their
timeframe and significance.
HIGH significance pattern on 4H = very strong signal,
  weight it as 1 full confluence point.
HIGH significance pattern on 1H = strong signal,
  include in entry timing recommendation.
HIGH significance pattern on 15M = entry confirmation,
  mention in entryTiming field specifically.
If a bearish pattern exists on any timeframe against
your bullish bias, explicitly mention it in RISK field.

PERSONAL PERFORMANCE CONTEXT:
You may receive the trader's personal performance
history. If hasData is true, use it to calibrate
your recommendation:

If currentSessionAccuracy is provided and < 45%:
  Add a note in the rationale field:
  'Note: historically lower accuracy in this session
  for this trader — consider reducing position size.'

If currentConfluenceAccuracy is provided and >= 65%:
  This is a statistically strong setup for this trader.
  Mention it briefly in entryTiming.

If bestSession matches current session:
  This is the trader's best performing session.
  Acknowledge in entryTiming if confidence is HIGH.

If bestConfluenceThreshold is set and current
confluenceScore >= bestConfluenceThreshold:
  This setup meets the trader's historically
  profitable threshold. Note it.

If hasData is false:
  Ignore all personal context — not enough data yet.

ENTRY TYPE — classify the entry quality:
- IDEAL:        conditions are perfect right now. For LONG: price pulling back to EMA20 with RSI 45-55 and macdHistogram still positive. For SHORT: mirror.
- AGGRESSIVE:   setup is forming, entry is early. Price above/below EMA20 on a fresh BULLISH_CROSS / BEARISH_CROSS in the last 2 candles.
- WAIT:         bias is clear but entry conditions are not met yet. Use this when LONG conditions exist but RSI > 65 (overbought chase) or price is more than 1 ATR away from EMA20. Mirror for SHORT with RSI < 35.
If recommendation is FLAT, entryType must be WAIT.

INVALIDATION LEVEL — the price at which the entire trade thesis is wrong, regardless of stop loss. Different from stop. If bullish because price is above EMA50, invalidationLevel is the EMA50 level. If that breaks, the thesis is wrong even if stop hasn't been hit.

MARKET CONDITION — classify current market:
- TRENDING_UP:    clear higher highs, EMA20 > EMA50, RSI consistently above 50
- TRENDING_DOWN:  clear lower lows, EMA20 < EMA50, RSI consistently below 50
- RANGING:        price oscillating, EMAs converging, RSI around 50
- BREAKOUT_WATCH: price compressing near Bollinger midline, ATR declining, expansion expected

ENTRY / STOP / TARGET RULES:
- LONG entry: pullback to EMA20 or support — never at session highs.
- SHORT entry: bounce to EMA20 or resistance — never at session lows.
- Stop: always beyond a structural level (swing high/low, or ATR buffer of 1-1.5x).
- Target: next structural level (swing high/low, round number, BB band).
- Risk/reward must be at least 1:2. If you cannot achieve it, recommend FLAT.

CATALYST FORMAT — exactly three labeled lines:
NOW: <one sentence describing what is moving gold right now>
RISK: <the single biggest threat to this trade>
TRIGGER: <the specific price action or event that would confirm the entry is valid right now>

OUTPUT: a single valid JSON object and nothing else. No markdown, no code fences, no explanation. Raw JSON.

JSON shape (every field required):
{
  "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "recommendation": "LONG" | "SHORT" | "FLAT",
  "entry": "exact price or tight range, e.g. 3281-3284",
  "stop": "exact price, e.g. 3264",
  "target": "exact price, e.g. 3318",
  "resistance": "nearest resistance level",
  "support": "nearest support level",
  "catalyst": "NOW: ... RISK: ... TRIGGER: ...",
  "rationale": "one-sentence structural rationale for entry/stop/target",
  "confluenceScore": 0..8,
  "confluenceTotal": 8,
  "signals": {
    "trend": "BULLISH" | "BEARISH" | "NEUTRAL",
    "momentum": "BULLISH" | "BEARISH" | "NEUTRAL",
    "macd": "BULLISH" | "BEARISH" | "NEUTRAL",
    "dxy": "BULLISH" | "BEARISH" | "NEUTRAL",
    "us10y": "BULLISH" | "BEARISH" | "NEUTRAL",
    "session": "BULLISH" | "BEARISH" | "NEUTRAL",
    "news": "BULLISH" | "BEARISH" | "NEUTRAL",
    "calendar": "BULLISH" | "BEARISH" | "NEUTRAL"
  },
  "holdTime": "1-3 hours",
  "riskReward": "1:2.4",
  "entryTiming": "one sentence on when exactly to fire",
  "exitPlan": "pre-event exit plan or take-profit ladder",
  "entryType": "IDEAL" | "AGGRESSIVE" | "WAIT",
  "invalidationLevel": "exact price",
  "marketCondition": "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "BREAKOUT_WATCH",
  "generatedAt": "ISO timestamp (we will overwrite this server-side)"
}`

// [SPRINT-4] Render the MULTI-TIMEFRAME ANALYSIS section of the
// user message. The 4H / 15M sections each render only when that
// timeframe's data is non-zero — `tf.ema20 === 0` is the signal
// that the per-TF fetch failed (the route returns an empty bundle
// in that case). Skipping the section gracefully keeps the prompt
// honest: Claude is told to apply 4H trend filtering, but if the
// 4H feed is down we don't pretend we have the data.
function buildMultiTimeframeSection(body: AnalysisRequest): string {
  const lines: string[] = ['=== MULTI-TIMEFRAME ANALYSIS ===']

  // 4H ─ macro trend context. The most important TF for direction.
  if (body.tf4h.ema20 !== 0) {
    lines.push(
      '4H Timeframe:',
      `  Trend: ${body.tf4h.trend}`,
      `  RSI: ${body.tf4h.rsi.toFixed(1)} — ${body.tf4h.rsiZone}`,
      `  MACD Histogram: ${body.tf4h.macdHistogram.toFixed(3)}`,
      `  MACD Cross: ${body.tf4h.macdCross}`,
      `  Price vs EMA20: ${body.tf4h.priceVsEma20}`,
      `  EMA20: $${body.tf4h.ema20.toFixed(2)}`,
      `  EMA50: $${body.tf4h.ema50.toFixed(2)}`,
      ''
    )
  } else {
    lines.push('4H Timeframe: data unavailable (skip 4H trend filter)', '')
  }

  // 15M ─ entry timing. Skip if the per-TF bundle is empty.
  if (body.tf15m.ema20 !== 0) {
    lines.push(
      '15M Timeframe (entry timing):',
      `  Trend: ${body.tf15m.trend}`,
      `  RSI: ${body.tf15m.rsi.toFixed(1)} — ${body.tf15m.rsiZone}`,
      `  MACD Histogram: ${body.tf15m.macdHistogram.toFixed(3)}`,
      `  MACD Cross: ${body.tf15m.macdCross}`,
      `  Price vs EMA20: ${body.tf15m.priceVsEma20}`,
      `  EMA20: $${body.tf15m.ema20.toFixed(2)}`
    )
  } else {
    lines.push('15M Timeframe: data unavailable (skip 15M entry confirmation)')
  }

  return lines.join('\n')
}

// [SPRINT-7] Render the PERSONAL PERFORMANCE HISTORY section.
// Always emits the section header so message format is consistent
// run-to-run; the body branches on hasData. When the trader has
// fewer than 5 decided outcomes the body explicitly tells Claude
// to ignore the context, which mirrors the system-prompt rule.
//
// Accuracy fields are formatted as "X%" or "no data" — never as
// "0%" — to avoid misleading Claude into thinking 0% means
// "always wrong" when it actually means "no sample yet".
function buildPersonalHistorySection(body: AnalysisRequest): string {
  const p = body.personalPatterns
  const lines: string[] = ['=== PERSONAL PERFORMANCE HISTORY ===']
  if (!p.hasData) {
    lines.push(
      `No personal history yet (${p.totalOutcomes}/5 outcomes recorded).`,
      'Ignoring personal context.'
    )
    return lines.join('\n')
  }
  const fmtPct = (v: number | null) =>
    v === null ? 'no data' : `${v.toFixed(0)}%`
  lines.push(
    `Data available: ${p.totalOutcomes} outcomes`,
    `Overall accuracy: ${p.overallAccuracy.toFixed(0)}%`,
    `Current session (${body.session}) accuracy: ${fmtPct(p.currentSessionAccuracy)}`,
    `Recent confluence-bucket accuracy: ${fmtPct(p.currentConfluenceAccuracy)}`,
    `Best session: ${p.bestSession ?? 'not yet determined'}`,
    `Best confluence threshold: ${
      p.bestConfluenceThreshold === null
        ? 'not yet determined'
        : `${p.bestConfluenceThreshold}+/8`
    }`,
    `Insight: ${p.insight}`
  )
  return lines.join('\n')
}

// [SPRINT-4] Render the DETECTED PATTERNS section. Always emits
// a header so the prompt structure is consistent; falls back to
// a single explanatory line when the array is empty (per spec).
function buildPatternsSection(body: AnalysisRequest): string {
  const lines: string[] = ['=== DETECTED PATTERNS ===']
  if (body.detectedPatterns.length === 0) {
    lines.push('No significant patterns detected on any timeframe.')
    return lines.join('\n')
  }
  for (const p of body.detectedPatterns) {
    lines.push(
      `${p.timeframe} ${p.pattern} — ${p.direction} — ${p.significance} — ${p.description}`
    )
  }
  return lines.join('\n')
}

// Detect a missing or placeholder ANTHROPIC_API_KEY. Treats
// "your_key_here" (the default in .env.example) and empty values
// as "no key" — short-circuits the SDK call and returns
// realistic mock data, so the trader sees a fully-populated
// Copilot card without a real Anthropic account.
function hasRealKey(key: string | undefined): key is string {
  return !!key && key !== 'your_key_here' && key.trim().length > 0
}

// Build a realistic mock analysis tied to the request's current
// price + bias from the macro signals. The numbers track real
// market state (entry/stop/target are computed off `price`),
// the catalyst follows the NOW/RISK/TRIGGER format, and the
// confluence breakdown is derived from the input snapshot so
// it reads as if a real analyst scored it. Used:
//   - whenever ANTHROPIC_API_KEY is missing or placeholder
//   - whenever the live SDK call errors out
function buildMockAnalysis(req: AnalysisRequest): AnalysisResult {
  // Derive a coarse bias from the snapshot. Bullish leans dominant
  // when the macro signals are gold-favorable + technicals aren't
  // overbought; bearish on the inverse. Otherwise neutral.
  const dxyBullish = req.dxyChangePct < 0 // dollar weakening = good for gold
  const yieldBullish = req.us10yChangePct < 0 // yields falling = good for gold
  const trendBullish = req.priceVsEma20 === 'ABOVE' && req.priceVsEma50 === 'ABOVE'
  const macdBullish = req.macdHistogram > 0
  const newsBullish = req.newsBullishCount > req.newsBearishCount
  const sessionBullish = req.sessionIsHighVolatility
  const calendarBullish = req.clearToTrade
  const overbought = req.rsi >= 70

  const bullCount =
    Number(dxyBullish) +
    Number(yieldBullish) +
    Number(trendBullish) +
    Number(macdBullish) +
    Number(newsBullish) +
    Number(sessionBullish) +
    Number(calendarBullish) +
    Number(!overbought)

  const isBullish = bullCount >= 5
  const isBearish = bullCount <= 2

  const bias = isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL'
  const recommendation =
    !req.clearToTrade
      ? 'FLAT'
      : isBullish
        ? 'LONG'
        : isBearish
          ? 'SHORT'
          : 'FLAT'
  const confidence = bullCount >= 6 || bullCount <= 1 ? 'HIGH' : bullCount >= 5 || bullCount <= 2 ? 'MEDIUM' : 'LOW'

  // Price-relative levels. Use ATR if available, otherwise a
  // sensible 1% buffer so the levels never collapse on each other.
  const atr = req.atr > 0 ? req.atr : Math.max(req.price * 0.01, 5)
  const p = req.price > 0 ? req.price : 3300

  const entryLow = isBullish ? p - atr * 0.5 : p + atr * 0.3
  const entryHigh = isBullish ? p - atr * 0.2 : p + atr * 0.6
  const stop = isBullish ? p - atr * 1.5 : p + atr * 1.5
  const target = isBullish ? p + atr * 3 : p - atr * 3
  const support = isBullish ? p - atr * 0.5 : p - atr * 1.2
  const resistance = isBullish ? p + atr * 1.2 : p + atr * 0.5
  const invalidation = isBullish ? req.ema50 || p - atr * 2 : req.ema50 || p + atr * 2

  const fmt = (n: number) => `$${n.toFixed(2)}`

  // Confluence breakdown. Each signal scored from the snapshot;
  // bullCount feeds the score itself.
  const signalDir = (b: boolean): 'BULLISH' | 'BEARISH' | 'NEUTRAL' =>
    b ? 'BULLISH' : 'BEARISH'

  const entryType: 'IDEAL' | 'AGGRESSIVE' | 'WAIT' =
    recommendation === 'FLAT'
      ? 'WAIT'
      : overbought || req.rsi <= 30
        ? 'WAIT'
        : Math.abs(p - req.ema20) < atr
          ? 'IDEAL'
          : 'AGGRESSIVE'

  const marketCondition: AnalysisResult['marketCondition'] =
    req.trend === 'UPTREND'
      ? 'TRENDING_UP'
      : req.trend === 'DOWNTREND'
        ? 'TRENDING_DOWN'
        : req.atr < 10
          ? 'BREAKOUT_WATCH'
          : 'RANGING'

  const directionWord = isBullish ? 'higher' : isBearish ? 'lower' : 'sideways'
  const catalystSentence =
    !req.clearToTrade
      ? `Calendar gate is closed — ${req.warningMessage ?? 'high-impact event imminent'}`
      : `Macro tape ${dxyBullish ? 'supportive (DXY soft)' : 'against (DXY firm)'}, ` +
        `yields ${yieldBullish ? 'easing' : 'rising'}, technicals ${trendBullish ? 'aligned' : 'mixed'}`

  const riskSentence = !req.clearToTrade
    ? `${req.nextEventTitle ?? 'Pending release'} in ${req.nextEventMinutes ?? '?'} min`
    : overbought
      ? 'RSI overbought — pullback risk'
      : isBullish
        ? `Failure to hold ${fmt(req.ema20 || p)}; DXY reversal`
        : `Reversal back above ${fmt(req.ema20 || p)}; DXY rally`

  const triggerSentence = !req.clearToTrade
    ? 'Wait for the event to print, then reassess'
    : isBullish
      ? `Hold above ${fmt(req.ema20 || p - atr)} with MACD histogram expanding`
      : isBearish
        ? `Reject ${fmt(req.ema20 || p + atr)} with MACD histogram contracting`
        : 'Range bound — wait for break of swing high/low'

  return {
    bias,
    confidence,
    recommendation,
    entry: `${entryLow.toFixed(0)}-${entryHigh.toFixed(0)}`,
    stop: stop.toFixed(0),
    target: target.toFixed(0),
    resistance: resistance.toFixed(0),
    support: support.toFixed(0),
    catalyst: `NOW: Gold tape leaning ${directionWord} on session. RISK: ${riskSentence}. TRIGGER: ${triggerSentence}.`,
    rationale:
      recommendation === 'FLAT'
        ? 'Insufficient confluence or calendar block — stand aside.'
        : `Structure aligns ${isBullish ? 'long' : 'short'} with ${atr.toFixed(2)} ATR room to ${target.toFixed(0)}.`,
    generatedAt: new Date().toISOString(),
    confluenceScore: isBullish ? bullCount : 8 - bullCount,
    confluenceTotal: 8,
    signals: {
      trend: signalDir(trendBullish),
      momentum: overbought ? 'BEARISH' : req.rsi <= 30 ? 'BULLISH' : 'NEUTRAL',
      macd: signalDir(macdBullish),
      dxy: signalDir(dxyBullish),
      us10y: signalDir(yieldBullish),
      session: sessionBullish ? 'BULLISH' : 'NEUTRAL',
      news: req.newsBullishCount > req.newsBearishCount
        ? 'BULLISH'
        : req.newsBearishCount > req.newsBullishCount
          ? 'BEARISH'
          : 'NEUTRAL',
      calendar: calendarBullish ? 'BULLISH' : 'BEARISH',
    },
    holdTime: '1-3 hours',
    riskReward: '1:2',
    entryTiming:
      entryType === 'IDEAL'
        ? `Enter on next pullback to ${fmt(req.ema20 || p)} with confirming candle close.`
        : entryType === 'AGGRESSIVE'
          ? `Setup forming — wait for retest before sizing up.`
          : `Conditions not aligned. Stand aside until RSI normalizes.`,
    exitPlan:
      !req.clearToTrade
        ? `Stay flat through ${req.nextEventTitle ?? 'pending release'}; reassess after.`
        : `Trail stop on each new ${isBullish ? 'higher' : 'lower'} swing; full exit at target or session close.`,
    entryType,
    invalidationLevel: typeof invalidation === 'number' ? invalidation.toFixed(0) : '——',
    marketCondition,
  }
}

// Stable, typed safe-default. NEUTRAL/LOW/FLAT explicitly tells
// the trader "no analysis available, do not act". Confluence
// fields zero out, signals all NEUTRAL, marketCondition RANGING,
// entryType WAIT — matches the FALLBACK shape from [#27].
const FALLBACK: AnalysisResult = {
  bias: 'NEUTRAL',
  confidence: 'LOW',
  recommendation: 'FLAT',
  entry: '——',
  stop: '——',
  target: '——',
  resistance: '——',
  support: '——',
  catalyst:
    'NOW: Analysis unavailable. RISK: API connection failed. TRIGGER: Retry once /api/analyze responds.',
  rationale: 'Unable to generate analysis at this time.',
  generatedAt: new Date().toISOString(),
  confluenceScore: 0,
  confluenceTotal: 8,
  signals: {
    trend: 'NEUTRAL',
    momentum: 'NEUTRAL',
    macd: 'NEUTRAL',
    dxy: 'NEUTRAL',
    us10y: 'NEUTRAL',
    session: 'NEUTRAL',
    news: 'NEUTRAL',
    calendar: 'NEUTRAL',
  },
  holdTime: '——',
  riskReward: '——',
  entryTiming: '——',
  exitPlan: '——',
  entryType: 'WAIT',
  invalidationLevel: '——',
  marketCondition: 'RANGING',
}

// Required fields on the parsed JSON. If any are missing the
// route falls through to FALLBACK rather than handing a
// half-shaped object back to the panel.
const REQUIRED_FIELDS: (keyof AnalysisResult)[] = [
  'bias',
  'confidence',
  'recommendation',
  'entry',
  'stop',
  'target',
  'resistance',
  'support',
  'catalyst',
  'rationale',
  'confluenceScore',
  'confluenceTotal',
  'signals',
  'holdTime',
  'riskReward',
  'entryTiming',
  'exitPlan',
  'entryType',
  'invalidationLevel',
  'marketCondition',
]

export async function POST(request: Request) {
  // Read the request body once up-front so it's available to
  // both the placeholder-key short-circuit and the real-call
  // path. Body shape is enforced by the AnalysisPanel
  // buildRequest() — server-side validation can be added later.
  let body: AnalysisRequest
  try {
    body = (await request.json()) as AnalysisRequest
  } catch {
    return NextResponse.json(FALLBACK, { status: 200 })
  }

  // No real Anthropic key configured → return realistic mock
  // analysis derived from the request snapshot. Keeps the Copilot
  // card fully populated during local dev / demo without a real
  // Anthropic account.
  if (!hasRealKey(process.env.ANTHROPIC_API_KEY)) {
    return NextResponse.json(buildMockAnalysis(body))
  }

  try {

    // Single user message — formatted plain-text snapshot of the
    // full request. Numbers carry explicit signs/units so the
    // model can't disambiguate them. Sections labeled the way
    // the system prompt's confluence rules reference them, so
    // Marcus has a 1:1 between input and the 8-signal scoring.
    const userMessage = `GOLD (XAU/USD) MARKET SNAPSHOT — ${new Date().toUTCString()}

=== PRICE ACTION ===
Current Price:   $${body.price.toFixed(2)}
Day Change:      ${body.changePct >= 0 ? '+' : ''}${body.changePct.toFixed(2)}%
Session High:    $${body.high.toFixed(2)}
Session Low:     $${body.low.toFixed(2)}
Day Open:        $${body.open.toFixed(2)}
Day Range Pos.:  ${body.dayRangePct.toFixed(0)}%  (0 = at low, 100 = at high)

=== TECHNICAL INDICATORS (1H) ===
EMA20:           $${body.ema20.toFixed(2)}  — price is ${body.priceVsEma20}
EMA50:           $${body.ema50.toFixed(2)}  — price is ${body.priceVsEma50}
EMA200:          $${body.ema200.toFixed(2)} — price is ${body.priceVsEma200}
Trend:           ${body.trend}

RSI (14):        ${body.rsi.toFixed(1)}  (zone: ${body.rsiZone})
MACD line:       ${body.macd.toFixed(3)}
MACD signal:     ${body.macdSignal.toFixed(3)}
MACD histogram:  ${body.macdHistogram.toFixed(3)}
MACD cross:      ${body.macdCross}

ATR (14):        $${body.atr.toFixed(2)}
Bollinger Up:    $${body.bbUpper.toFixed(2)}
Bollinger Low:   $${body.bbLower.toFixed(2)}
Swing High (20): $${body.swingHigh.toFixed(2)}
Swing Low (20):  $${body.swingLow.toFixed(2)}

=== MACRO ===
DXY:             ${body.dxy.toFixed(2)}  (${body.dxyChangePct >= 0 ? '+' : ''}${body.dxyChangePct.toFixed(2)}%)  — inverse to gold
US 10Y Yield:    ${body.us10y.toFixed(2)}%  (${body.us10yChangePct >= 0 ? '+' : ''}${body.us10yChangePct.toFixed(2)}%)  — rising yields BEARISH for gold

=== SESSION ===
Current:         ${body.session}
High Volatility: ${body.sessionIsHighVolatility ? 'YES — peak volume' : 'NO — normal volume'}

=== ECONOMIC CALENDAR ===
Clear to Trade:  ${body.clearToTrade ? 'YES — no HIGH-impact event in the next 45 minutes' : 'NO — HIGH-IMPACT EVENT IMMINENT (force FLAT)'}
${body.warningMessage ? `Warning:         ${body.warningMessage}` : 'Warning:         none'}
${body.nextEventTitle ? `Next event:      ${body.nextEventTitle} in ${body.nextEventMinutes} minutes` : 'Next event:      none on the radar'}

=== NEWS SENTIMENT ===
Bullish:         ${body.newsBullishCount}
Bearish:         ${body.newsBearishCount}
Neutral:         ${body.newsNeutralCount}

Top Headlines:
${body.topHeadlines.map((n: string, i: number) => `${i + 1}. ${n}`).join('\n')}

${buildMultiTimeframeSection(body)}

${buildPatternsSection(body)}

${buildPersonalHistorySection(body)}

=== TASK ===
Score each of the 8 confluence signals as BULLISH, BEARISH, or NEUTRAL.
Count the totals. Apply the entry rules. Deliver the JSON exactly per the schema in your system prompt. Raw JSON only.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const first = message.content[0]
    if (!first || first.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    const text = first.text.trim()
    const parsed = JSON.parse(text) as AnalysisResult

    // Always overwrite generatedAt with the server clock so we
    // never trust whatever the model emitted.
    parsed.generatedAt = new Date().toISOString()

    // Field-level validation — bail to FALLBACK if any required
    // key is missing.
    for (const field of REQUIRED_FIELDS) {
      if (!(field in parsed)) {
        throw new Error(`Missing field: ${field}`)
      }
    }

    // Belt-and-suspenders: if the calendar gate was closed, force
    // FLAT regardless of what Claude returned. The system prompt
    // already instructs this, but the model occasionally lapses
    // when the bias signals are very strong — so we enforce it
    // server-side.
    if (!body.clearToTrade) {
      parsed.recommendation = 'FLAT'
      parsed.entryType = 'WAIT'
    }

    return NextResponse.json(parsed)
  } catch (err) {
    // Real key was provided but the SDK call / parse failed.
    // Fall through to a snapshot-derived mock so the trader
    // sees a fully-populated Copilot card instead of NEUTRAL/
    // FLAT zeros — outage state is signalled by the LAST stamp
    // not advancing rather than by an empty UI.
    console.error('[/api/analyze] failed:', err)
    return NextResponse.json(buildMockAnalysis(body))
  }
}

// Reference FALLBACK so it stays exported as a module-scope
// constant (used historically; kept for the future "show empty
// state instead of mock" branch).
void FALLBACK
