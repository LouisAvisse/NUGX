// GET /api/news — curated gold/macro headlines.
// Mock implementation: returns 5 fixed articles spanning HIGH /
// MEDIUM / LOW impact so the NewsFeed badges and ordering can be
// developed against a realistic mix. Real implementation will hit
// newsdata.io (free tier, key in .env.local), filter, and tag
// each article using the keyword logic in .claude/context.md.

import { NextResponse } from 'next/server'
import type { NewsResponse } from '@/lib/types'

export async function GET() {
  const mock: NewsResponse = {
    articles: [
      {
        title: 'Fed signals patience on rate cuts as inflation stays elevated',
        source: 'Reuters',
        publishedAt: new Date().toISOString(),
        url: '#',
        impact: 'HIGH',
      },
      {
        title: 'Gold holds near record highs amid geopolitical tensions',
        source: 'Bloomberg',
        publishedAt: new Date().toISOString(),
        url: '#',
        impact: 'HIGH',
      },
      {
        title: 'China central bank continues gold reserve accumulation',
        source: 'FT',
        publishedAt: new Date().toISOString(),
        url: '#',
        impact: 'MEDIUM',
      },
      {
        title: 'Dollar weakens as safe-haven demand supports metals',
        source: 'WSJ',
        publishedAt: new Date().toISOString(),
        url: '#',
        impact: 'MEDIUM',
      },
      {
        title: 'Analysts forecast gold target at $3,400 by Q3',
        source: 'MarketWatch',
        publishedAt: new Date().toISOString(),
        url: '#',
        impact: 'LOW',
      },
    ],
  }
  return NextResponse.json(mock)
}
