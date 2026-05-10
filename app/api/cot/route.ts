// GET /api/cot — [PHASE-12.2] CFTC COT Managed-Money positioning.
//
// Every Friday the CFTC publishes the Commitments of Traders for
// the prior Tuesday. The headline number every gold desk watches
// is Managed Money net long (long − short) in COMEX gold futures.
// Extreme readings — top or bottom 5% of 5y history — are reliable
// contrarian signals.
//
// Source: CFTC's public Socrata API (Disaggregated Futures Only).
// Endpoint:
//
//   https://publicreporting.cftc.gov/resource/72hh-3qpy.json
//
// Free, no API key, public dataset. We pull the last 5 years of
// weekly observations for COMEX gold (~260 records, ~30KB JSON),
// compute net positions + the percentile rank of today's net, and
// return a compact CotPositioning object.
//
// Caching: 12-hour Next.js revalidate. COT updates once a week
// (Friday afternoon ET); 12h is plenty fresh while keeping the
// dashboard from hammering the Socrata endpoint.

import { NextResponse } from 'next/server'
import type { CotPositioning } from '@/lib/types'

export const revalidate = 43_200 // 12 hours

// CFTC Socrata raw row shape — only the fields we read. Socrata
// strings everything; we Number-parse defensively.
interface CotRow {
  contract_market_name?: string
  report_date_as_yyyy_mm_dd?: string
  m_money_positions_long_all?: string
  m_money_positions_short_all?: string
  nonrept_positions_long_all?: string
  nonrept_positions_short_all?: string
}

// 5 years of weekly observations is ~260 rows. We pull a generous
// 280 to be safe across DST and the rare missing week.
const COT_URL =
  'https://publicreporting.cftc.gov/resource/72hh-3qpy.json' +
  '?contract_market_name=GOLD' +
  '&$order=report_date_as_yyyy_mm_dd%20DESC' +
  '&$limit=280'

// Stable typed fallback. The UI hides the COT chip when the
// payload comes back with reportDate === '' (a sentinel we use
// only on outage).
const FALLBACK: CotPositioning = {
  reportDate: '',
  managedMoneyLong: 0,
  managedMoneyShort: 0,
  managedMoneyNet: 0,
  netPercentile5y: 0,
  nonReportableNet: null,
  weekOverWeekChange: 0,
  meta: { source: 'mock' },
}

// Parse one Socrata row into a clean record, defensively. Returns
// null when the required fields are missing or non-numeric.
function parseRow(r: CotRow): {
  date: string
  long: number
  short: number
  nonRepLong: number
  nonRepShort: number
} | null {
  const date = r.report_date_as_yyyy_mm_dd
  const long = Number(r.m_money_positions_long_all)
  const short = Number(r.m_money_positions_short_all)
  if (!date || !Number.isFinite(long) || !Number.isFinite(short)) return null
  const nonRepLong = Number(r.nonrept_positions_long_all)
  const nonRepShort = Number(r.nonrept_positions_short_all)
  return {
    date: String(date).slice(0, 10),
    long,
    short,
    nonRepLong: Number.isFinite(nonRepLong) ? nonRepLong : 0,
    nonRepShort: Number.isFinite(nonRepShort) ? nonRepShort : 0,
  }
}

// Compute "what percentile is `value` in `series`?" — used for the
// 5y percentile rank of today's net position. Returns 0..100.
function percentileOf(value: number, series: number[]): number {
  if (series.length === 0) return 0
  let below = 0
  for (const s of series) if (s < value) below++
  return Math.round((below / series.length) * 100)
}

export async function GET() {
  try {
    const res = await fetch(COT_URL, {
      next: { revalidate },
      // 12s upper bound — Socrata is normally quick but the 280-row
      // payload occasionally takes a beat to assemble.
      signal: AbortSignal.timeout(12_000),
      // Identify ourselves cleanly. CFTC's Socrata endpoint is
      // public but it's good manners to surface the user agent.
      headers: { 'user-agent': 'NUGX/1.0 (gold dashboard, +localhost)' },
    })
    if (!res.ok) throw new Error(`CFTC HTTP ${res.status}`)
    const raw = (await res.json()) as CotRow[]
    const rows = raw.map(parseRow).filter(Boolean) as Exclude<
      ReturnType<typeof parseRow>,
      null
    >[]
    if (rows.length < 2) throw new Error('insufficient COT history')

    // rows are ordered DESC by date — newest first. nets[0] = current.
    const nets = rows.map((r) => r.long - r.short)
    const latest = rows[0]
    const prev = rows[1]
    const currentNet = latest.long - latest.short
    const previousNet = prev.long - prev.short

    // Percentile rank computed against the whole 5y window so the
    // chip can flag extremes ("net long in top 5% — historically a
    // contrarian SHORT signal").
    const percentile = percentileOf(currentNet, nets)

    const positioning: CotPositioning = {
      reportDate: latest.date,
      managedMoneyLong: latest.long,
      managedMoneyShort: latest.short,
      managedMoneyNet: currentNet,
      netPercentile5y: percentile,
      nonReportableNet:
        latest.nonRepLong || latest.nonRepShort
          ? latest.nonRepLong - latest.nonRepShort
          : null,
      weekOverWeekChange: currentNet - previousNet,
      meta: { source: 'live' },
    }
    return NextResponse.json(positioning)
  } catch (err) {
    console.error(
      '[/api/cot] fetch failed:',
      err instanceof Error ? err.message : 'unknown'
    )
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
