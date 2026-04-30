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
  try {
    const body: AnalysisRequest = await request.json()

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
    console.error('[/api/analyze] failed:', err)
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
