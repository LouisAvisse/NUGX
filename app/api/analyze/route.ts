// POST /api/analyze — Claude-powered trade analysis.
// Will read an AnalysisRequest body (price/signals/session/news),
// call Anthropic Claude (claude-sonnet-4-20250514), and return an
// AnalysisResult (see lib/types.ts). Placeholder returns
// { ok: true } during scaffold.

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ ok: true })
}
