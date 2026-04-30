// CalendarPanel — fixed-height slot in the right column.
//
// Surfaces the gold-relevant economic events from
// useCalendar (#29). The header carries the same trade-gate
// indicator that the AnalysisPanel banner uses (CLEAR / BLOCKED
// + warning copy); the body lists the next ~5 upcoming events
// with countdown chips, country badges, forecast/previous, and
// a "passed" tag for events already past.
//
// Render branches:
//   loading + empty   → 2 shimmer rows
//   error             → "CALENDAR UNAVAILABLE" centered
//   no events         → "No upcoming gold events today."
//   loaded            → up-to-EVENT_DISPLAY events
//
// Data freshness: useCalendar polls every 60s so minutesUntil
// drift between refetches is bounded by ~1 minute. Events
// within 30m get a pulsing red countdown; 30-60m get amber;
// 60m+ get muted gray with hours+minutes formatting.

'use client'

import Tooltip from '@/components/Tooltip'
import { useCalendar } from '@/lib/hooks/useCalendar'
import type { EconomicEvent, EventImpact } from '@/lib/types'

// Cap the visible event list. The pane is fixed-height (max
// 180px overflow-y:auto) so anything beyond ~5 rows scrolls;
// 6 keeps a comfortable reserve.
const EVENT_DISPLAY = 6

// Impact badge color — same palette as NewsFeed's badges.
function impactColor(impact: EventImpact): string {
  if (impact === 'HIGH') return '#f87171'
  if (impact === 'MEDIUM') return '#fbbf24'
  return '#888888'
}

// Format minutesUntil into a compact countdown string + color
// + whether it should pulse (urgent).
function formatCountdownChip(e: EconomicEvent): {
  text: string
  color: string
  pulse: boolean
} {
  if (!e.isUpcoming) {
    return { text: 'passed', color: '#666666', pulse: false }
  }
  const m = e.minutesUntil
  if (m <= 30) {
    return { text: `in ${m}m`, color: '#f87171', pulse: true }
  }
  if (m <= 60) {
    return { text: `in ${m}m`, color: '#fbbf24', pulse: false }
  }
  const hours = Math.floor(m / 60)
  const mins = m % 60
  return {
    text: `in ${hours}h ${mins}m`,
    color: '#555555',
    pulse: false,
  }
}

// Two-bar shimmer skeleton row used while data loads.
function SkeletonRow() {
  return (
    <div
      style={{
        padding: '6px 12px',
        borderBottom: '1px solid #1a1a1a',
        height: '36px',
      }}
    >
      <div
        className="shimmer"
        style={{
          width: '60%',
          height: '8px',
          background: '#1a1a1a',
          borderRadius: '2px',
        }}
      />
      <div
        className="shimmer"
        style={{
          width: '30%',
          height: '7px',
          background: '#1a1a1a',
          borderRadius: '2px',
          marginTop: '6px',
        }}
      />
    </div>
  )
}

export default function CalendarPanel() {
  const { data, loading, error } = useCalendar()

  const events = data?.events ?? []
  const clearToTrade = data?.clearToTrade ?? true

  // Pick the body branch.
  let body: React.ReactNode
  if (loading && events.length === 0) {
    body = (
      <>
        <SkeletonRow />
        <SkeletonRow />
      </>
    )
  } else if (error) {
    body = (
      <div
        style={{
          padding: '24px 12px',
          textAlign: 'center',
          color: '#666666',
          fontSize: '10px',
        }}
      >
        CALENDAR UNAVAILABLE
      </div>
    )
  } else if (events.length === 0) {
    body = (
      <div
        style={{
          padding: '8px 12px',
          textAlign: 'center',
          color: '#666666',
          fontSize: '9px',
        }}
      >
        No upcoming gold events today.
      </div>
    )
  } else {
    body = events.slice(0, EVENT_DISPLAY).map((e, i) => {
      const chip = formatCountdownChip(e)
      const titleColor = e.isUpcoming ? '#b0b0b0' : '#888888'
      return (
        <div key={`${e.title}-${e.date}-${i}`}>
          {/* Top row — title (+ country badge) on the left,
              impact + countdown chip on the right. */}
          <div
            style={{
              padding: '6px 12px',
              borderBottom: '1px solid #1a1a1a',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: titleColor,
                  fontSize: '9px',
                  lineHeight: 1.4,
                  maxWidth: '170px',
                }}
              >
                {e.title}
              </div>
              {e.country && (
                <span
                  style={{
                    background: '#161616',
                    border: '1px solid #222222',
                    color: '#555555',
                    fontSize: '8px',
                    padding: '1px 4px',
                    marginTop: '3px',
                    display: 'inline-block',
                  }}
                >
                  {e.country}
                </span>
              )}
            </div>
            <div
              style={{
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  color: impactColor(e.impact),
                  fontSize: '8px',
                  letterSpacing: '0.08em',
                }}
              >
                {e.impact}
              </div>
              <div
                className={chip.pulse ? 'pulse' : ''}
                style={{
                  color: chip.color,
                  fontSize: '8px',
                  marginTop: '2px',
                }}
              >
                {chip.text}
              </div>
            </div>
          </div>
          {/* Forecast / previous row — only when we have either. */}
          {(e.forecast !== '—' || e.previous !== '—') && (
            <div
              style={{
                padding: '2px 12px 6px 12px',
                display: 'flex',
                gap: '12px',
                borderBottom: '1px solid #1a1a1a',
              }}
            >
              <span style={{ color: '#888888', fontSize: '8px' }}>
                F: {e.forecast}
              </span>
              <span style={{ color: '#666666', fontSize: '8px' }}>
                P: {e.previous}
              </span>
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div
      style={{
        background: '#111111',
        border: '1px solid #222222',
        flexShrink: 0,
      }}
    >
      {/* Header — CALENDAR label + CLEAR/BLOCKED indicator. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px 6px 12px',
          borderBottom: '1px solid #222222',
        }}
      >
        <Tooltip
          position="right"
          content="Upcoming gold-relevant economic events. Filtered for USD/EUR/GBP and titles that historically move gold (Fed, CPI, NFP, FOMC, yields). Refreshes every 60s — never enter a new trade within 45 minutes of a HIGH-impact event."
        >
          <span
            style={{
              color: '#888888',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            CALENDAR
          </span>
        </Tooltip>
        {/* Trade-gate indicator. Pulses on BLOCKED so the
            trader catches it from peripheral vision. */}
        {clearToTrade ? (
          <span style={{ color: '#4ade80', fontSize: '9px' }}>● CLEAR</span>
        ) : (
          <span
            className="pulse"
            style={{ color: '#f87171', fontSize: '9px' }}
          >
            ● BLOCKED
          </span>
        )}
      </div>

      {/* Body — scrolls when content exceeds max-height. */}
      <div
        style={{
          maxHeight: '180px',
          overflowY: 'auto',
          padding: '6px 0',
        }}
      >
        {body}
      </div>
    </div>
  )
}
