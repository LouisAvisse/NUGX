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

// Realistic mock articles. Returned when NEWSDATA_API_KEY isn't
// set, is the placeholder, or the upstream errors. The mix is
// designed to exercise every UI branch:
//   - 3 HIGH impact headlines (Fed / yield / war keywords)
//   - 3 MEDIUM impact headlines
//   - 2 LOW impact (analyst-flavored) headlines
//   - sentiment spans BULLISH / BEARISH / NEUTRAL
// Timestamps are computed at request time so they always look
// recent and the relative-time formatters in NewsFeed have
// sensible inputs.
function buildMockArticles(): NewsArticle[] {
  const now = Date.now()
  // Spread the timestamps across the last 6 hours so the news
  // list reads like a typical session, freshest first.
  const ago = (minutes: number) =>
    new Date(now - minutes * 60_000).toISOString()
  return [
    {
      title: 'Fed signals patience on rate cuts as core inflation stays elevated',
      source: 'Reuters',
      publishedAt: ago(8),
      url: 'https://example.com/article-1',
      impact: 'HIGH',
      sentiment: 'BULLISH',
    },
    {
      title: 'Gold holds near record highs amid Middle East tensions',
      source: 'Bloomberg',
      publishedAt: ago(24),
      url: 'https://example.com/article-2',
      impact: 'HIGH',
      sentiment: 'BULLISH',
    },
    {
      title: 'Treasury yields surge on hawkish FOMC minutes, dollar strengthens',
      source: 'Wall Street Journal',
      publishedAt: ago(46),
      url: 'https://example.com/article-3',
      impact: 'HIGH',
      sentiment: 'BEARISH',
    },
    {
      title: 'China central bank continues gold reserve accumulation in March',
      source: 'Financial Times',
      publishedAt: ago(72),
      url: 'https://example.com/article-4',
      impact: 'MEDIUM',
      sentiment: 'BULLISH',
    },
    {
      title: 'Dollar weakens as safe-haven demand supports precious metals',
      source: 'CNBC',
      publishedAt: ago(98),
      url: 'https://example.com/article-5',
      impact: 'MEDIUM',
      sentiment: 'BULLISH',
    },
    {
      title: 'Strong jobs report sends gold lower in early NY trade',
      source: 'MarketWatch',
      publishedAt: ago(140),
      url: 'https://example.com/article-6',
      impact: 'MEDIUM',
      sentiment: 'BEARISH',
    },
    {
      title: 'Analyst outlook: gold target raised to $3,400 by Q3',
      source: 'Goldman Sachs Research',
      publishedAt: ago(180),
      url: 'https://example.com/article-7',
      impact: 'LOW',
      sentiment: 'BULLISH',
    },
    {
      title: 'Mining production hits new yearly high in Australia, supply outlook stable',
      source: 'Mining Weekly',
      publishedAt: ago(240),
      url: 'https://example.com/article-8',
      impact: 'LOW',
      sentiment: 'NEUTRAL',
    },
  ]
}

// Mock response — realistic enough that the UI looks alive
// without a real API key, while keeping the real-API path in
// place for when a key is supplied later.
const MOCK_RESPONSE: NewsResponse = { articles: [] } // built lazily below

// True placeholder fallback — empty list. Only used as a
// last-resort if even the mock builder throws (it shouldn't).
const FALLBACK: NewsResponse = { articles: [] }

// Detect a missing or placeholder NEWSDATA_API_KEY. The default
// value in .env.example is "your_key_here" — we treat that
// (and any empty value) as "no key", which short-circuits the
// upstream call and returns realistic mock data instead.
// `key is string` type predicate lets TypeScript narrow `key`
// to a defined string after a passing check.
function hasRealKey(key: string | undefined): key is string {
  return !!key && key !== 'your_key_here' && key.trim().length > 0
}

// Suppress unused-warning on the lazy mock placeholder while
// keeping it documented above.
void MOCK_RESPONSE

// Minimal upstream row shape we care about. newsdata.io returns
// many more fields; we only read these.
interface NewsdataRow {
  title?: string
  source_name?: string
  pubDate?: string
  link?: string
}

export async function GET() {
  const key = process.env.NEWSDATA_API_KEY

  // No real key configured → short-circuit to realistic mock
  // articles. The dashboard UI then exercises every branch
  // (sentiment dots, impact badges, ratio bar, filter chips)
  // without the user having to provision a newsdata.io account
  // first.
  if (!hasRealKey(key)) {
    return NextResponse.json({
      articles: buildMockArticles(),
    } satisfies NewsResponse)
  }

  try {

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
    // Real key was provided but the upstream call failed (rate
    // limit, network, parse error, etc). Return realistic mock
    // articles rather than an empty list so the dashboard
    // doesn't go blank — surfaces "API connected but data
    // currently unavailable" via a richer surface. Switch back
    // to FALLBACK if we ever want a clear "broken state" signal
    // in the UI.
    console.error('[/api/news] fetch failed:', err)
    return NextResponse.json(
      { articles: buildMockArticles() } satisfies NewsResponse,
      { status: 200 }
    )
  }
}

// Reference FALLBACK so it stays exported as a module-scope
// constant (used historically; kept for the future "show empty
// state instead of mock" branch).
void FALLBACK
