// POST /api/analyze — Claude-powered trade analysis.
// Mock implementation: returns a fixed AnalysisResult so the
// AnalysisPanel can render bias/confidence/recommendation, the
// entry/stop/target stack, and the catalyst+rationale block before
// the Claude SDK call is wired in. Real implementation will read
// an AnalysisRequest body, call claude-sonnet-4-20250514, and shape
// the response identically.
//
// Method is POST because the real route consumes a JSON body; a GET
// against this URL will return a 405, which is the expected and
// correct behavior during the mock phase.

import { NextResponse } from 'next/server'
import type { AnalysisResult } from '@/lib/types'

export async function POST() {
  const mock: AnalysisResult = {
    bias: 'BULLISH',
    confidence: 'MEDIUM',
    recommendation: 'LONG',
    entry: '3280-3285',
    stop: '3265',
    target: '3320',
    resistance: '3305',
    support: '3265',
    catalyst:
      'Dollar weakness and Fed patience narrative supporting gold. Watch NY/London overlap for momentum confirmation.',
    rationale: 'Trend intact above key support, macro tailwinds in place.',
    generatedAt: new Date().toISOString(),
  }
  return NextResponse.json(mock)
}
