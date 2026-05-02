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
import { T } from '@/lib/copy'
import { explainEvent } from '@/lib/eventGlossary'
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
  // [F-21] French countdown copy: "passé" / "dans 23m" / "dans 2h 14m"
  if (!e.isUpcoming) {
    return { text: T.calendarPassed, color: '#666666', pulse: false }
  }
  const m = e.minutesUntil
  if (m <= 30) {
    return { text: `${T.calendarInPrefix} ${m}m`, color: '#f87171', pulse: true }
  }
  if (m <= 60) {
    return { text: `${T.calendarInPrefix} ${m}m`, color: '#fbbf24', pulse: false }
  }
  const hours = Math.floor(m / 60)
  const mins = m % 60
  return {
    text: `${T.calendarInPrefix} ${hours}h ${mins}m`,
    color: '#555555',
    pulse: false,
  }
}

// Format an event's ISO date as a human-readable UTC line for
// the title tooltip. Example output:
//   "Mer. 30 avr. 12:30 UTC"
// Compact, locale-aware, unambiguous.
function formatEventWhen(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const time = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  })
  return `${date} ${time} UTC`
}

// Build the tooltip body for an event row. The displayed title
// is often a terse data label ("ISM Manufacturing PMI") that
// means nothing to a non-economist trader — and the same hour
// can host materially different events (routine print vs Trump
// speech vs Powell remarks). The tooltip layers content from
// most-actionable to most-detailed:
//
//   1. Full untruncated title
//   2. Country · UTC date+time
//   3. Impact tier in French
//   4. Forecast vs Previous (when available — gives surprise
//      direction at a glance)
//   5. EDUCATIONAL: what the event IS (1 sentence)
//   6. EDUCATIONAL: what the surprise direction means for gold
//
// Sections 5+6 come from lib/eventGlossary.ts which keyword-
// matches the title against ~25 known event types (Fed, FOMC,
// CPI, NFP, GDP, PCE, ISM, retail, central-bank speeches,
// political speeches). When no glossary entry matches the
// tooltip falls back to metadata-only — never blank.
function buildEventTooltip(e: EconomicEvent): string {
  const lines: string[] = []
  lines.push(e.title)
  lines.push(`${e.country || '—'}  ·  ${formatEventWhen(e.date)}`)
  const impactFr =
    e.impact === 'HIGH'
      ? 'Impact ÉLEVÉ'
      : e.impact === 'MEDIUM'
        ? 'Impact MOYEN'
        : 'Impact FAIBLE'
  lines.push(impactFr)
  if (e.forecast !== '—' || e.previous !== '—') {
    lines.push(`Prévi. : ${e.forecast}    Préc. : ${e.previous}`)
  }
  // [event glossary] Append the educational layer when we have
  // a match. Blank line separator so the metadata block reads
  // distinctly from the explanation.
  const expl = explainEvent(e.title)
  if (expl) {
    lines.push('')
    lines.push(`Ce que c'est : ${expl.summary}`)
    lines.push(`Pour l'or : ${expl.gold}`)
  }
  return lines.join('\n')
}

// Render one event row. Extracted from the main render so the
// "weekend gap" branch can append the same rows under a graceful
// explainer header without duplicating the JSX.
function renderEventRow(e: EconomicEvent, i: number): React.ReactNode {
  const chip = formatCountdownChip(e)
  const titleColor = e.isUpcoming ? '#b0b0b0' : '#888888'
  const tooltip = buildEventTooltip(e)
  return (
    <div key={`${e.title}-${e.date}-${i}`}>
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
          {/* Title wrapped in a Tooltip so a generic event
              label ("ISM Manufacturing PMI") can be expanded
              with full context (UTC time, forecast/previous,
              impact tier). The displayed text wraps within the
              maxWidth — the tooltip is for the trader who wants
              the full picture without leaving the dashboard. */}
          <Tooltip position="right" content={tooltip}>
            <span
              style={{
                color: titleColor,
                fontSize: '9px',
                lineHeight: 1.4,
                maxWidth: '170px',
                display: 'inline-block',
              }}
            >
              {e.title}
            </span>
          </Tooltip>
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
      {(e.forecast !== '—' || e.previous !== '—') && (
        <div
          style={{
            padding: '2px 12px 6px 12px',
            display: 'flex',
            gap: '12px',
            borderBottom: '1px solid #1a1a1a',
          }}
        >
          <Tooltip
            position="right"
            content="Prévision (forecast) du marché pour cette donnée. À comparer avec la valeur réelle (sortie au moment de l'événement) — un écart matériel déclenche une réaction sur l'or."
          >
            <span style={{ color: '#888888', fontSize: '8px' }}>
              F : {e.forecast}
            </span>
          </Tooltip>
          <Tooltip
            position="right"
            content="Précédent (previous release) — la dernière valeur publiée pour cette même donnée. Donne le baseline pour interpréter la nouvelle sortie."
          >
            <span style={{ color: '#666666', fontSize: '8px' }}>
              P : {e.previous}
            </span>
          </Tooltip>
        </div>
      )}
    </div>
  )
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
      >CALENDRIER INDISPONIBLE</div>
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
        {T.calendarEmpty}
      </div>
    )
  } else if (events.every((e) => !e.isUpcoming)) {
    // [Weekend gap] ForexFactory ships only the current week's
    // JSON; on a Saturday before the Sunday-evening rollover all
    // events are past. Render a graceful explainer instead of
    // a wall of "passé" chips so the trader knows the panel
    // isn't broken.
    body = (
      <div
        style={{
          padding: '12px 14px',
          color: '#888888',
          fontSize: '10px',
          lineHeight: 1.5,
        }}
      >
        <div style={{ color: '#b0b0b0', fontSize: '10px', marginBottom: '4px' }}>
          Aucun événement à venir cette semaine.
        </div>
        <div style={{ color: '#666666', fontSize: '9px' }}>
          Le calendrier reprend son cycle dimanche soir UTC, à la
          réouverture des marchés. Les derniers événements de la
          semaine écoulée restent affichés ci-dessous pour mémoire.
        </div>
        <div
          style={{
            marginTop: '10px',
            paddingTop: '8px',
            borderTop: '1px solid #1a1a1a',
            color: '#444444',
            fontSize: '8px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Semaine écoulée
        </div>
      </div>
    )
    // Fall through to the normal events.map() below by
    // appending past events under the explainer — wrap both in
    // a fragment so they render in sequence.
    body = (
      <>
        {body}
        {events.slice(0, EVENT_DISPLAY).map((e, i) => renderEventRow(e, i))}
      </>
    )
  } else {
    body = events.slice(0, EVENT_DISPLAY).map((e, i) => renderEventRow(e, i))
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
          content="Événements économiques à venir pertinents pour l'or. Filtrés sur USD/EUR/GBP et sur les titres qui font historiquement bouger l'or (Fed, CPI, NFP, FOMC, rendements). Rafraîchi toutes les 60s — ne jamais ouvrir de nouvelle position dans les 45 minutes précédant un événement à fort impact."
        >
          <span
            style={{
              color: '#888888',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >CALENDRIER</span>
        </Tooltip>
        {/* Trade-gate indicator. Pulses on BLOCKED so the
            trader catches it from peripheral vision. */}
        {clearToTrade ? (
          <span style={{ color: '#4ade80', fontSize: '9px' }}>● DÉGAGÉ</span>
        ) : (
          <span
            className="pulse"
            style={{ color: '#f87171', fontSize: '9px' }}
          >● BLOQUÉ</span>
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
