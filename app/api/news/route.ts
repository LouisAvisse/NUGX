// GET /api/news — curated gold/macro headlines.
// Will hit newsdata.io (free tier; key in .env.local), filter for
// gold/macro relevance, tag each article with HIGH/MEDIUM/LOW
// impact, and return a NewsResponse (see lib/types.ts).
// Placeholder returns { ok: true } during scaffold.

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ ok: true })
}
