// GET /api/calendar — economic calendar for gold-relevant events.
//
// Source: ForexFactory's weekly JSON feed at
//   https://nfs.faireconomy.media/ff_calendar_thisweek.json
// Free, no API key, public — same feed many trading dashboards
// consume. Returned as a flat array of event rows; we filter
// down to gold-relevant currencies + keywords, drop LOW impact,
// compute minutesUntil at fetch time, and surface the
// "clear to trade" gate (false iff a HIGH-impact event is < 45m
// away — never enter a new trade in that window).
//
// Failure handling: any thrown error returns FALLBACK with
// HTTP 200; the panel just shows its empty state.

import { NextResponse } from 'next/server'
import type {
  CalendarResponse,
  EconomicEvent,
  EventImpact,
} from '@/lib/types'

// Gold-relevant currencies. ForexFactory uses 3-letter codes
// (USD, EUR, GBP, …) and sometimes 2-letter country codes — we
// match either form via includes() below.
const RELEVANT_COUNTRIES = ['USD', 'US', 'EUR', 'EU', 'GBP', 'UK', 'CNY', 'CN']

// Title keywords that historically move gold. Combined with the
// currency filter so a "fed" hit on a non-USD row still gets in
// (rare but possible — keeps the keyword list authoritative).
const GOLD_RELEVANT_KEYWORDS = [
  'fed',
  'fomc',
  'powell',
  'cpi',
  'inflation',
  'nfp',
  'non-farm',
  'unemployment',
  'gdp',
  'pce',
  'retail sales',
  'interest rate',
  'rate decision',
  'treasury',
  'ppi',
  'durable goods',
  'ism',
  'consumer confidence',
  'jolts',
]

function isGoldRelevant(title: string, country: string): boolean {
  const lower = title.toLowerCase()
  const country_ = country.toUpperCase()
  const isRelevantCountry = RELEVANT_COUNTRIES.some((c) => country_.includes(c))
  const isRelevantKeyword = GOLD_RELEVANT_KEYWORDS.some((k) =>
    lower.includes(k)
  )
  // Both must match — keeps the list lean and decision-relevant.
  return isRelevantCountry && isRelevantKeyword
}

// ForexFactory ships impact as a string ("High" / "Medium" /
// "Low") in some payloads and a numeric severity in others.
// Handle both.
function mapImpact(raw: string): EventImpact {
  const lower = raw.toLowerCase()
  if (lower.includes('high') || lower === '3') return 'HIGH'
  if (lower.includes('medium') || lower === '2') return 'MEDIUM'
  return 'LOW'
}

// Empty-but-valid response — keeps CalendarPanel renderable.
const FALLBACK: CalendarResponse = {
  events: [],
  nextHighImpact: null,
  clearToTrade: true,
  warningMessage: null,
}

// Minimal upstream row shape we read from. ForexFactory returns
// extra fields (currency, time, etc.) that we ignore.
interface FFRow {
  title?: string
  country?: string
  date?: string
  impact?: string
  forecast?: string
  previous?: string
}

// Trading-gate window: never open a new position within this
// many minutes of a HIGH-impact event.
const CLEAR_TO_TRADE_WINDOW_MIN = 45

// Soft-warn window: when a HIGH event is this close, surface a
// "plan exit" copy in warningMessage even if still clear to trade.
const PLAN_EXIT_WINDOW_MIN = 120

// Cap returned events list. The panel renders ~5-6 visibly
// before scrolling, 12 leaves room for the trader to scroll a
// touch beyond the fold without overwhelming the column.
const EVENT_CAP = 12

// ForexFactory only publishes a single weekly JSON file —
// `ff_calendar_thisweek.json`. Sibling URLs (nextweek, thismonth,
// lastweek) all return 404. Verified live with curl.
//
// Practical implication: the file rolls Sunday ~17:00 ET to
// contain the new Mon-Sat trading week. On a Saturday before
// rollover the dashboard sees an "all events past" state. We
// detect that in the panel and show a graceful weekend message
// rather than scrolling past stale chips.
const FF_THIS_WEEK_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'

export async function GET() {
  try {
    const res = await fetch(FF_THIS_WEEK_URL, {
      headers: { Accept: 'application/json' },
      // Cache 1h at the Next data layer — the underlying weekly
      // feed updates infrequently and the hook is already
      // polling every minute on the client to keep minutesUntil
      // fresh.
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`)
    const raw = (await res.json()) as unknown
    if (!Array.isArray(raw)) throw new Error('Unexpected calendar shape')

    const now = new Date()

    const events: EconomicEvent[] = (raw as FFRow[])
      .filter(
        (e) =>
          !!e.title &&
          !!e.date &&
          mapImpact(e.impact ?? '') !== 'LOW' &&
          isGoldRelevant(e.title, e.country ?? '')
      )
      .map((e) => {
        const eventDate = new Date(e.date as string)
        const minutesUntil = Math.round(
          (eventDate.getTime() - now.getTime()) / 60_000
        )
        return {
          title: e.title as string,
          country: e.country ?? '',
          date: eventDate.toISOString(),
          impact: mapImpact(e.impact ?? ''),
          forecast: e.forecast ?? '—',
          previous: e.previous ?? '—',
          isUpcoming: minutesUntil > 0,
          minutesUntil,
        }
      })
      // Sort: upcoming first (nearest in time first), then most
      // recent past (least negative minutesUntil first).
      .sort((a, b) => {
        if (a.isUpcoming && !b.isUpcoming) return -1
        if (!a.isUpcoming && b.isUpcoming) return 1
        return Math.abs(a.minutesUntil) - Math.abs(b.minutesUntil)
      })

    // Earliest upcoming HIGH-impact event — drives the warning
    // banner and the trade gate.
    const nextHighImpact =
      events.find((e) => e.isUpcoming && e.impact === 'HIGH') ?? null

    // Clear to trade iff no HIGH event within the gate window.
    const clearToTrade = !events.some(
      (e) =>
        e.isUpcoming &&
        e.impact === 'HIGH' &&
        e.minutesUntil <= CLEAR_TO_TRADE_WINDOW_MIN
    )

    // Two-tier warning: the gate-violation copy when blocked,
    // a softer "plan exit" copy when within the soft-warn window
    // but not yet inside the gate window.
    let warningMessage: string | null = null
    if (!clearToTrade && nextHighImpact) {
      warningMessage = `${nextHighImpact.title} in ${nextHighImpact.minutesUntil} minutes — avoid new entries`
    } else if (
      nextHighImpact &&
      nextHighImpact.minutesUntil <= PLAN_EXIT_WINDOW_MIN
    ) {
      warningMessage = `${nextHighImpact.title} in ${nextHighImpact.minutesUntil} minutes — plan exit`
    }

    const payload: CalendarResponse = {
      events: events.slice(0, EVENT_CAP),
      nextHighImpact,
      clearToTrade,
      warningMessage,
    }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/calendar] failed:', err)
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
