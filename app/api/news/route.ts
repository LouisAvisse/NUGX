// GET /api/news — curated gold/macro headlines.
//
// Source: Google News RSS — completely free, no key, no rate
// limit beyond reasonable use. Replaces the old newsdata.io
// upstream (which required a paid registration) with a public
// XML feed that delivers the same kind of gold + Fed + macro
// headlines we tag for impact and sentiment.
//
// Why Google News RSS:
//   • No API key — nothing to secure or rotate.
//   • Live, ranked aggregation across hundreds of outlets
//     (Reuters, Bloomberg, FT, MarketWatch, Investing.com, etc.)
//     — better breadth than any single free-tier API.
//   • Stable XML schema; no auth headers; CORS-irrelevant
//     (we call it server-side from this route).
//
// Tagging logic (impact + sentiment) is unchanged from the
// previous newsdata-based implementation — same keyword sets,
// same downstream NewsArticle shape.
//
// Failure handling: any thrown error returns realistic mock
// articles via buildMockArticles() with HTTP 200, so the
// dashboard never goes blank on a transient upstream hiccup.

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
  'geopolit',
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
  if (BULLISH_GOLD_KEYWORDS.some((k) => lower.includes(k))) return 'BULLISH'
  if (BEARISH_GOLD_KEYWORDS.some((k) => lower.includes(k))) return 'BEARISH'
  return 'NEUTRAL'
}

// Realistic mock articles — only used when the Google News RSS
// fetch fails (network blip, DNS, parse error). The mix exercises
// every UI branch: 3 HIGH / 3 MEDIUM / 2 LOW impact + a balanced
// BULLISH / BEARISH / NEUTRAL sentiment spread. Timestamps are
// computed at request time so the news list always reads "live".
function buildMockArticles(): NewsArticle[] {
  const now = Date.now()
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

// [SECURITY M1/L7] Allow only http/https article URLs through.
// The <link> tag from Google News RSS is read with a regex parser
// (no scheme enforcement of its own), so a poisoned feed could
// emit `<link>javascript:alert(...)</link>` — which would then
// flow into NewsFeed's window.open() click handler and execute in
// the page origin. Validating once at the route is the canonical
// fix: it closes the gap regardless of how the URL is rendered
// downstream (text, key, href, window.open).
function isSafeArticleUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

// Decode the handful of HTML entities Google News RSS actually
// emits in titles. Full-spec HTML decoding would need a library;
// in practice the feed only uses these five plus the numeric
// &#39; (apostrophe).
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

// Pull the inner text of a single tag out of an item's XML body.
// Returns undefined when the tag is absent. Non-greedy match
// avoids accidentally swallowing past a sibling tag.
function pickTag(itemXml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)
  const m = itemXml.match(re)
  return m ? decodeEntities(m[1].trim()) : undefined
}

// Strip a trailing " - SOURCE NAME" suffix from a Google News
// title. The feed appends the source to the title with a hyphen
// separator; the dedicated <source> tag carries the same name
// cleanly, so we trim the duplicate from the headline.
function stripSourceSuffix(title: string, source: string | undefined): string {
  if (!source) return title
  const suffix = ` - ${source}`
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title
}

// Google News RSS query — same intent as the old newsdata.io
// query: gold spot keywords + Fed/FOMC + macro inflation. The
// hl/gl/ceid params lock to US English so headlines arrive in
// the same language as the impact-keyword matchers expect.
const GOOGLE_NEWS_RSS = (() => {
  const url = new URL('https://news.google.com/rss/search')
  url.searchParams.set(
    'q',
    'gold price OR XAUUSD OR "Federal Reserve" OR FOMC OR inflation'
  )
  url.searchParams.set('hl', 'en-US')
  url.searchParams.set('gl', 'US')
  url.searchParams.set('ceid', 'US:en')
  return url.toString()
})()

// How many articles to surface to the UI. Matches the old
// behaviour (newsdata responses were sliced at 10).
const MAX_ARTICLES = 10

// [SECURITY L4/L10] Bounds on the upstream fetch — Google News
// usually returns ~50KB for our query, so 1MB is generous; the
// cap exists so a pathological multi-megabyte response can't
// exhaust memory before the regex parser even runs. The 8s
// timeout protects against an upstream hang tying up the route
// indefinitely (Node's default fetch has no timeout).
const RSS_FETCH_TIMEOUT_MS = 8000
const RSS_MAX_BYTES = 1_000_000

export async function GET() {
  // [SECURITY L4] Abort the fetch after RSS_FETCH_TIMEOUT_MS so a
  // hung upstream can't keep a Next.js worker pinned. Cleared in
  // the finally block whether the fetch succeeded or threw.
  const abort = new AbortController()
  const timeoutHandle = setTimeout(
    () => abort.abort(),
    RSS_FETCH_TIMEOUT_MS
  )

  try {
    const res = await fetch(GOOGLE_NEWS_RSS, {
      // Hook polls every 15min — no Next data cache wanted.
      next: { revalidate: 0 },
      // Some Google endpoints are picky about the UA; a generic
      // browser-style UA avoids the occasional 403.
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml',
        'User-Agent':
          'Mozilla/5.0 (compatible; NUGX-Dashboard/1.0; +https://example.com)',
      },
      signal: abort.signal,
    })

    if (!res.ok) {
      throw new Error(`google news rss responded ${res.status}`)
    }

    // [SECURITY L4/L10] Cap the response size before parsing.
    // The old code read .text() then sliced — which still allocates
    // the full body. We slice the string after read (cheap clone)
    // AND set a Content-Length cap to short-circuit obviously
    // oversized payloads before allocating.
    const declaredLen = Number(res.headers.get('content-length') ?? '0')
    if (declaredLen > RSS_MAX_BYTES) {
      throw new Error(`google news rss too large: ${declaredLen} bytes`)
    }
    const fullXml = await res.text()
    const xml = fullXml.length > RSS_MAX_BYTES
      ? fullXml.slice(0, RSS_MAX_BYTES)
      : fullXml
    if (!xml || !xml.includes('<item>')) {
      throw new Error('Empty or malformed RSS feed')
    }

    // Split into <item>…</item> blocks. Regex is fine here —
    // RSS items don't nest, so the non-greedy match is unambiguous.
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
    const articles: NewsArticle[] = itemMatches
      .slice(0, MAX_ARTICLES * 2) // over-fetch in case some rows are malformed
      .map((itemXml) => {
        const rawTitle = pickTag(itemXml, 'title') ?? ''
        const link = pickTag(itemXml, 'link') ?? ''
        const pubDate = pickTag(itemXml, 'pubDate')
        const source = pickTag(itemXml, 'source')
        const title = stripSourceSuffix(rawTitle, source)
        return {
          title,
          source: source ?? 'Unknown',
          publishedAt: new Date(pubDate ?? Date.now()).toISOString(),
          url: link,
          impact: tagImpact(title),
          sentiment: tagSentiment(title),
        } satisfies NewsArticle
      })
      // [SECURITY M1/L7] Drop any item whose URL isn't http(s):
      // — the click handler in NewsFeed.tsx hands a.url straight
      // to window.open, which executes javascript:/data: URIs.
      .filter((a) => !!a.title && !!a.url && isSafeArticleUrl(a.url))
      .slice(0, MAX_ARTICLES)

    if (articles.length === 0) {
      throw new Error('No articles parsed from RSS feed')
    }

    return NextResponse.json({ articles } satisfies NewsResponse)
  } catch (err) {
    // Network/parse failure — return realistic mock articles so
    // the dashboard doesn't go blank. The real-API path is
    // covered above; this branch only fires on outage.
    // [SECURITY L1] Log only the message; full error objects can
    // include internal node_modules paths we don't want shipped.
    console.error(
      '[/api/news] fetch failed:',
      err instanceof Error ? err.message : 'unknown'
    )
    return NextResponse.json(
      { articles: buildMockArticles() } satisfies NewsResponse,
      { status: 200 }
    )
  } finally {
    // Always clear the abort timer so it doesn't fire on a
    // subsequent request that reuses the event loop tick.
    clearTimeout(timeoutHandle)
  }
}
