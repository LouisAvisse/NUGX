// GET /api/news — curated gold/macro headlines.
//
// Fetches from newsdata.io (free tier; key in .env.local as
// NEWSDATA_API_KEY) on every request, filters out malformed
// rows, caps at 10 articles, and tags each with HIGH / MEDIUM
// / LOW impact via keyword matchers per .claude/context.md.
//
// Failure handling: any thrown error returns FALLBACK
// (empty articles array) with HTTP 200 — the client never
// crashes; NewsFeed just renders its empty/error state.

import { NextResponse } from 'next/server'
import type {
  NewsResponse,
  NewsArticle,
  ImpactLevel,
  NewsSentiment,
} from '@/lib/types'

// Keyword sets for impact tagging — case-insensitive matches
// against the article title. HIGH wins over LOW when both fire,
// per the order of checks in tagImpact below.
const HIGH_KEYWORDS = [
  'fed',
  'federal reserve',
  'cpi',
  'inflation',
  'nfp',
  'jobs',
  'war',
  'sanctions',
  'rate cut',
  'rate hike',
  'fomc',
  'dollar',
  'dxy',
  'treasury',
  'yield',
  'crisis',
]

const LOW_KEYWORDS = [
  'analyst',
  'forecast',
  'outlook',
  'prediction',
  'target',
  'expect',
]

function tagImpact(title: string): ImpactLevel {
  const lower = title.toLowerCase()
  if (HIGH_KEYWORDS.some((k) => lower.includes(k))) return 'HIGH'
  if (LOW_KEYWORDS.some((k) => lower.includes(k))) return 'LOW'
  return 'MEDIUM'
}

// Sentiment-tagging keyword lists. Independent of impact —
// `impact` answers "should I pay attention", `sentiment` answers
// "which way does this push gold". Bullish for gold = anything
// that weakens the dollar / lowers yields / raises safe-haven
// demand. Bearish for gold = the inverse. NEUTRAL is the default
// when neither set hits.
const BULLISH_GOLD_KEYWORDS = [
  'war',
  'sanctions',
  'crisis',
  'inflation',
  'rate cut',
  'dovish',
  'dollar weak',
  'dxy fall',
  'central bank buy',
  'safe haven',
  'geopolit', // matches "geopolitical", "geopolitics"
  'fed pause',
  'yield fall',
  'stimulus',
  'debt',
  'deficit',
]

const BEARISH_GOLD_KEYWORDS = [
  'rate hike',
  'hawkish',
  'dollar strong',
  'yield rise',
  'risk on',
  'equity rally',
  'tightening',
  'strong jobs',
  'beat expectations',
  'economic growth',
  'recovery',
]

function tagSentiment(title: string): NewsSentiment {
  const lower = title.toLowerCase()
  // Bullish wins over bearish on overlap — gold's safe-haven
  // narrative typically dominates when both signals fire (e.g.
  // "rate hike but recession looming").
  if (BULLISH_GOLD_KEYWORDS.some((k) => lower.includes(k))) return 'BULLISH'
  if (BEARISH_GOLD_KEYWORDS.some((k) => lower.includes(k))) return 'BEARISH'
  return 'NEUTRAL'
}

// Empty-but-valid response — keeps NewsFeed renderable.
const FALLBACK: NewsResponse = { articles: [] }

// Minimal upstream row shape we care about. newsdata.io returns
// many more fields; we only read these.
interface NewsdataRow {
  title?: string
  source_name?: string
  pubDate?: string
  link?: string
}

export async function GET() {
  try {
    const key = process.env.NEWSDATA_API_KEY
    if (!key) throw new Error('NEWSDATA_API_KEY not set')

    // Build the URL via URL/URLSearchParams so values are
    // properly percent-encoded (especially the quoted phrase
    // "Federal Reserve" which contains a space).
    const url = new URL('https://newsdata.io/api/1/news')
    url.searchParams.set('apikey', key)
    url.searchParams.set('q', 'gold XAU "Federal Reserve" inflation')
    url.searchParams.set('language', 'en')
    url.searchParams.set('category', 'business')

    const res = await fetch(url.toString(), {
      // Hook polls every 15min — no Next data cache wanted.
      next: { revalidate: 0 },
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`newsdata responded ${res.status}`)
    }

    const raw = await res.json()

    if (raw.status !== 'success' || !Array.isArray(raw.results)) {
      throw new Error('Unexpected newsdata response shape')
    }

    // Drop rows missing the must-have fields, cap at 10, and
    // map into NewsArticle.
    const articles: NewsArticle[] = (raw.results as NewsdataRow[])
      .filter((r) => !!r.title && !!r.link)
      .slice(0, 10)
      .map((r) => ({
        title: r.title!,
        source: r.source_name ?? 'Unknown',
        // pubDate format is "YYYY-MM-DD HH:mm:ss"; new Date()
        // accepts that and toISOString() normalizes for the
        // formatTime helper.
        publishedAt: new Date(r.pubDate ?? Date.now()).toISOString(),
        url: r.link!,
        impact: tagImpact(r.title!),
        // Directional sentiment for gold — drives the colored
        // dot in NewsFeed and the bullish/bearish counts in
        // the analyze request body.
        sentiment: tagSentiment(r.title!),
      }))

    return NextResponse.json({ articles } satisfies NewsResponse)
  } catch (err) {
    console.error('[/api/news] fetch failed:', err)
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
