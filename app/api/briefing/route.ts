// POST /api/briefing — generates a London-session briefing for
// gold via the Anthropic API.
//
// Input:  { price, changePct, session, dxy, us10y, trend, rsi,
//           calendarEvents[], topHeadlines[], previousClose }
// Output: { briefing: SessionBriefingContent }
//
// Failure handling: if ANTHROPIC_API_KEY is missing/placeholder
// or the SDK call fails, the route returns a stable mock briefing
// derived from the request snapshot — same posture as
// /api/analyze so the UI never sits on an empty briefing modal
// during local dev.

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { SessionBriefingContent } from '@/lib/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface BriefingRequest {
  price: number
  changePct: number
  session: string
  dxy: number
  us10y: number
  trend: string
  rsi: number
  calendarEvents: string[]
  topHeadlines: string[]
  previousClose: number
}

const SYSTEM_PROMPT = `You are Marcus Reid opening the trading day.
Generate a concise London session briefing for a gold day trader.
You are disciplined, precise, and focused only on what matters today.

Respond with valid JSON only, no markdown:
{
  "overnightSummary": "1-2 sentences on what happened overnight in gold",
  "keyLevels": "2-3 key price levels to watch today with brief reason",
  "calendarRisk": "1 sentence on calendar events that could impact gold today",
  "sessionBias": "1 sentence directional bias for London session with reasoning",
  "watchFor": "The single most important thing to watch for a trade today",
  "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}`

// Detect a missing or placeholder ANTHROPIC_API_KEY — same logic
// as /api/analyze. Treats "your_key_here" and empty values as
// "no key" and short-circuits to mock data.
function hasRealKey(key: string | undefined): key is string {
  return !!key && key !== 'your_key_here' && key.trim().length > 0
}

// Stable mock briefing derived from the request snapshot. Lets
// the BriefingModal render fully populated content during local
// dev without an API key, and during outages.
function buildMockBriefing(body: BriefingRequest): SessionBriefingContent {
  const directionWord = body.changePct >= 0 ? 'up' : 'down'
  const dxySoft = body.dxy < 105
  const yieldsRising = body.us10y >= 4.5
  const bias: SessionBriefingContent['bias'] =
    body.trend === 'UPTREND' && dxySoft
      ? 'BULLISH'
      : body.trend === 'DOWNTREND' && yieldsRising
        ? 'BEARISH'
        : 'NEUTRAL'
  const confidence: SessionBriefingContent['confidence'] =
    body.calendarEvents.length > 0 ? 'MEDIUM' : 'LOW'

  return {
    overnightSummary: `Gold ${directionWord} ${Math.abs(body.changePct).toFixed(2)}% from yesterday's close at $${body.previousClose.toFixed(2)} — currently $${body.price.toFixed(2)}.`,
    keyLevels: `Watch session high near $${(body.price * 1.005).toFixed(2)} as resistance; downside reference $${(body.price * 0.995).toFixed(2)}.`,
    calendarRisk:
      body.calendarEvents.length > 0
        ? `Today: ${body.calendarEvents.slice(0, 2).join(', ')} — size accordingly.`
        : 'No high-impact events scheduled — purely technical session.',
    sessionBias: `${bias} bias — DXY ${dxySoft ? 'soft' : 'firm'}, US10Y at ${body.us10y.toFixed(2)}%.`,
    watchFor:
      bias === 'BULLISH'
        ? `Pullback to EMA20 holding for a long entry once London volume kicks in.`
        : bias === 'BEARISH'
          ? `Failed bounce to resistance for a short entry into NY/London overlap.`
          : `Range break — wait for clean direction before sizing.`,
    bias,
    confidence,
  }
}

// Required keys on a parsed briefing — bail to mock if any missing.
const REQUIRED_FIELDS: (keyof SessionBriefingContent)[] = [
  'overnightSummary',
  'keyLevels',
  'calendarRisk',
  'sessionBias',
  'watchFor',
  'bias',
  'confidence',
]

export async function POST(request: Request) {
  let body: BriefingRequest
  try {
    body = (await request.json()) as BriefingRequest
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!hasRealKey(process.env.ANTHROPIC_API_KEY)) {
    return NextResponse.json({ briefing: buildMockBriefing(body) })
  }

  try {
    const date = new Date().toISOString().slice(0, 10)
    const userMessage = `Generate London session briefing for ${date}.

OVERNIGHT:
  Gold close yesterday: $${body.previousClose.toFixed(2)}
  Current price:        $${body.price.toFixed(2)} (${body.changePct >= 0 ? '+' : ''}${body.changePct.toFixed(2)}%)
  Current trend:        ${body.trend}
  RSI:                  ${body.rsi.toFixed(1)}
  DXY:                  ${body.dxy.toFixed(2)}
  US10Y:                ${body.us10y.toFixed(2)}%

TODAY'S CALENDAR:
${body.calendarEvents.length > 0 ? body.calendarEvents.map((e) => `- ${e}`).join('\n') : 'No high-impact events today'}

TOP HEADLINES:
${body.topHeadlines.length > 0 ? body.topHeadlines.map((h, i) => `${i + 1}. ${h}`).join('\n') : 'No notable headlines'}

Generate the session briefing now.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const first = message.content[0]
    if (!first || first.type !== 'text') {
      throw new Error('Unexpected response type')
    }
    const parsed = JSON.parse(first.text.trim()) as SessionBriefingContent
    for (const field of REQUIRED_FIELDS) {
      if (!(field in parsed)) {
        throw new Error(`Missing field: ${field}`)
      }
    }
    return NextResponse.json({ briefing: parsed })
  } catch (err) {
    console.error('[/api/briefing] failed:', err)
    return NextResponse.json({ briefing: buildMockBriefing(body) })
  }
}
