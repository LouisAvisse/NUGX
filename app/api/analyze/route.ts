// POST /api/analyze — Claude-powered XAU/USD trade analysis.
//
// Reads an AnalysisRequest body (price + signals + session +
// recent headlines), packages it as a single user message, and
// asks claude-sonnet-4-20250514 to return a structured
// AnalysisResult JSON. The system prompt forces raw JSON only —
// no markdown fences, no explanation, no preamble — so we can
// JSON.parse the response directly.
//
// Failure handling: any error (parse failure, missing field,
// network error, missing key) returns FALLBACK with HTTP 200.
// FALLBACK is NEUTRAL/FLAT/LOW with "——" in every level — the
// safe default when analysis is unavailable.

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { AnalysisRequest, AnalysisResult } from '@/lib/types'

// One Anthropic client per process — uses ANTHROPIC_API_KEY
// from .env.local automatically.
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// System prompt — defines the analyst persona, the strict JSON
// output schema, and the trading rules Claude must respect. The
// "raw JSON only" rule is critical: any markdown fences will
// break our JSON.parse below.
const SYSTEM_PROMPT = `You are a professional XAU/USD day trader analyst with 15 years of experience. You analyze market conditions and provide structured, actionable trade analysis for the current session.

You must respond with a single valid JSON object and nothing else.
No markdown, no explanation, no code fences. Raw JSON only.

The JSON must match this exact shape:
{
  "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "recommendation": "LONG" | "SHORT" | "FLAT",
  "entry": "price or range as string e.g. 3280-3285",
  "stop": "price as string e.g. 3265",
  "target": "price as string e.g. 3320",
  "resistance": "price as string e.g. 3305",
  "support": "price as string e.g. 3265",
  "catalyst": "2-3 sentences on the main market driver and what to watch",
  "rationale": "1 concise sentence on the tactical trade rationale",
  "generatedAt": "current ISO timestamp"
}

Rules:
- Entry, stop and target must be realistic relative to current price
- Stop loss should be beyond a key structure level
- Risk/reward ratio should be at least 1:2
- If market is choppy or unclear, bias NEUTRAL and recommendation FLAT
- Consider DXY and US10Y inverse correlation to gold
- NY/London Overlap session has highest volatility — reflect this
- Be concise and decisive — no hedging language`

// Stable, typed safe-default. NEUTRAL/LOW/FLAT explicitly tells
// the trader "no analysis available, do not act".
const FALLBACK: AnalysisResult = {
  bias: 'NEUTRAL',
  confidence: 'LOW',
  recommendation: 'FLAT',
  entry: '——',
  stop: '——',
  target: '——',
  resistance: '——',
  support: '——',
  catalyst: 'Analysis unavailable. Check API connection and retry.',
  rationale: 'Unable to generate analysis at this time.',
  generatedAt: new Date().toISOString(),
}

// Required fields on the parsed JSON — used for shape validation
// before we hand the response back to the client.
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
]

export async function POST(request: Request) {
  try {
    const body: AnalysisRequest = await request.json()

    // Single user message — formatted plain-text snapshot of
    // the current market state. Numbers are rendered with
    // explicit signs/units so the model never has to
    // disambiguate them.
    const userMessage = `Analyze XAU/USD for a day trade opportunity.

CURRENT PRICE DATA:
- Price: $${body.price.toFixed(2)}
- Change: ${body.changePct >= 0 ? '+' : ''}${body.changePct.toFixed(2)}%
- Session high: $${body.high.toFixed(2)}
- Session low: $${body.low.toFixed(2)}

MACRO SIGNALS:
- DXY (USD Index): ${body.dxy.toFixed(2)}
- US 10Y Yield: ${body.us10y.toFixed(2)}%

TRADING SESSION: ${body.session}

LATEST MARKET NEWS:
${body.news.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Provide your structured JSON analysis now.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    // The SDK returns content[] of typed blocks; we expect a
    // single text block. Anything else means the system prompt
    // was ignored — reject and fall through to FALLBACK.
    const first = message.content[0]
    if (!first || first.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    const text = first.text.trim()
    const parsed = JSON.parse(text) as AnalysisResult

    // Always overwrite generatedAt with the server clock so
    // we never trust whatever the model emitted (it may be
    // hallucinated or stale).
    parsed.generatedAt = new Date().toISOString()

    // Field-level validation — bail to FALLBACK if any
    // required key is missing.
    for (const field of REQUIRED_FIELDS) {
      if (!(field in parsed)) {
        throw new Error(`Missing field: ${field}`)
      }
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[/api/analyze] failed:', err)
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
