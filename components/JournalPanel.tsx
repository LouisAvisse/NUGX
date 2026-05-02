// JournalPanel — slide-in overlay (right edge) with two tabs:
//
//   JOURNAL: log new trades, see open trades with a "close" form,
//            see closed trades with realized P&L.
//   MEMORY:  derived stats from the analysis history (the
//            useHistory hook). Overall accuracy, breakdowns by
//            session / confluence score / entry type, plus a
//            human-readable insight string.
//
// Recreated for [SPRINT-6]. The original was deleted in [#44] when
// the team retired the journal feature; the rebuild adds the
// MEMORY tab on top of the original journal data layer so the
// trader can see how their decisions are actually performing.
//
// All localStorage I/O lives in lib/journal.ts and lib/history.ts;
// this component reads through hooks only (useJournal +
// useHistory).
//
// ESC to close is wired at the page level via existing keyboard
// handlers; click-outside-to-close is wired in the overlay below.

'use client'

import { useState } from 'react'
import { useJournal } from '@/lib/hooks/useJournal'
import {
  displayMgmtState,
  useTradeManager,
} from '@/lib/hooks/useTradeManager'
import { useGoldPrice } from '@/lib/hooks/useGoldPrice'
import { useHistory } from '@/lib/hooks/useHistory'
import { calculatePnL, formatPnL } from '@/lib/journal'
import { formatPrice, formatDateTime } from '@/lib/utils'
import { getCurrentSession } from '@/lib/session'
import type {
  JournalEntry,
  PersonalPatterns,
  TradeDirection,
} from '@/lib/types'

interface JournalPanelProps {
  isOpen: boolean
  onClose: () => void
}

// Color tier for accuracy values shown on the bars and percentage
// labels. Mirrors the design-system palette.
function accuracyColor(pct: number): string {
  if (pct >= 65) return '#4ade80'
  if (pct >= 50) return '#fbbf24'
  return '#f87171'
}

// Direction-by-direction palette for the LONG/SHORT toggle and
// per-entry chips.
function directionStyle(dir: TradeDirection, active: boolean): React.CSSProperties {
  if (dir === 'LONG') {
    return active
      ? { background: '#0a1a0a', color: '#4ade80', border: '1px solid #1a3a1a' }
      : { background: 'transparent', color: '#444444', border: '1px solid #222222' }
  }
  return active
    ? { background: '#1a0a0a', color: '#f87171', border: '1px solid #3a1a1a' }
    : { background: 'transparent', color: '#444444', border: '1px solid #222222' }
}

// Shared label tone for tiny uppercase muted labels — matches
// AnalysisPanel's labelStyle for visual consistency.
const labelStyle: React.CSSProperties = {
  color: '#444444',
  fontSize: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
}

const inputStyle: React.CSSProperties = {
  background: '#0a0a0a',
  border: '1px solid #222222',
  color: '#e5e5e5',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  padding: '4px 6px',
  width: '100%',
}

// Shared bar layout for accuracy rows in MEMORY tab. label on the
// left, bar in the middle, percentage + count on the right. Keeps
// session / confluence / entry-type rows visually aligned.
function AccuracyRow({
  label,
  count,
  accuracy,
  hasOutcomes,
  highlight,
}: {
  label: string
  count: number
  accuracy: number
  hasOutcomes: boolean
  highlight?: boolean
}) {
  const color = hasOutcomes ? accuracyColor(accuracy) : '#333333'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 0',
        borderLeft: highlight ? '2px solid #4ade80' : 'none',
        paddingLeft: highlight ? '6px' : 0,
      }}
    >
      <span style={{ color: '#666666', fontSize: '9px', minWidth: '60px' }}>{label}</span>
      <div
        style={{
          flex: 1,
          height: '3px',
          background: '#1e1e1e',
          borderRadius: '1px',
        }}
      >
        <div
          style={{
            width: hasOutcomes ? `${accuracy}%` : '0%',
            height: '3px',
            background: color,
            borderRadius: '1px',
          }}
        />
      </div>
      <span style={{ color, fontSize: '10px', minWidth: '32px', textAlign: 'right' }}>
        {hasOutcomes ? `${accuracy}%` : '——'}
      </span>
      <span style={{ color: '#333333', fontSize: '8px' }}>({count})</span>
    </div>
  )
}

// Per-entry close form. Each open entry owns its own exit-price
// state via this child component so typing in one card doesn't
// re-render the others' inputs.
function EntryCloseForm({
  onClose,
}: {
  onClose: (exit: number) => void
}) {
  const [exit, setExit] = useState('')
  function submit() {
    const v = parseFloat(exit)
    if (!Number.isFinite(v)) return
    onClose(v)
    setExit('')
  }
  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
      <input
        type="number"
        step="0.01"
        placeholder="EXIT"
        value={exit}
        onChange={(e) => setExit(e.target.value)}
        style={{ ...inputStyle, flex: 1 }}
      />
      <button
        type="button"
        onClick={submit}
        className="terminal-btn"
        style={{
          background: '#161616',
          border: '1px solid #2a2a2a',
          color: '#e5e5e5',
          fontSize: '9px',
          letterSpacing: '0.1em',
          padding: '0 12px',
          cursor: 'pointer',
        }}
      >
        CLOSE
      </button>
    </div>
  )
}

// One journal entry rendered as a card.
function EntryCard({
  entry,
  onClose,
  onDelete,
}: {
  entry: JournalEntry
  onClose: (exit: number) => void
  onDelete: () => void
}) {
  const isOpen = entry.exitPrice === undefined
  const pnl = calculatePnL(entry)
  const pnlColor = pnl > 0 ? '#4ade80' : pnl < 0 ? '#f87171' : '#888888'

  return (
    <div
      style={{
        margin: '0 8px 6px 8px',
        padding: '10px 12px',
        background: '#161616',
        border: '1px solid #222222',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              color: entry.direction === 'LONG' ? '#4ade80' : '#f87171',
              fontSize: '10px',
              fontWeight: 500,
              letterSpacing: '0.1em',
            }}
          >
            {entry.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'}
          </span>
          {/* [PHASE-5] Management chip — only on open entries that
              have advanced past INITIAL. Palette and label come
              from displayMgmtState in useTradeManager. */}
          {isOpen
            ? (() => {
                const m = displayMgmtState(entry.mgmtState)
                if (!m) return null
                return (
                  <span
                    style={{
                      color: m.color,
                      background: m.background,
                      border: m.border,
                      fontSize: '8px',
                      padding: '1px 5px',
                      letterSpacing: '0.08em',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {m.label}
                  </span>
                )
              })()
            : null}
        </div>
        <span style={{ color: '#444444', fontSize: '9px' }}>{entry.session}</span>
      </div>

      <div
        style={{
          marginTop: '8px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '6px',
        }}
      >
        {(['ENTRY', 'STOP', 'TARGET'] as const).map((key, i) => {
          const value = i === 0 ? entry.entry : i === 1 ? entry.stop : entry.target
          const color = i === 0 ? '#60a5fa' : i === 1 ? '#f87171' : '#4ade80'
          return (
            <div key={key}>
              <div style={labelStyle}>{key}</div>
              <div style={{ color, fontSize: '10px', marginTop: '2px' }}>
                {Number.isFinite(value) && value > 0 ? formatPrice(value) : '——'}
              </div>
            </div>
          )
        })}
      </div>

      {isOpen ? (
        <EntryCloseForm onClose={onClose} />
      ) : (
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ ...labelStyle, color: '#888888' }}>CLOSED</span>
          <span style={{ color: pnlColor, fontSize: '11px', fontWeight: 500 }}>
            {formatPnL(pnl)}
          </span>
        </div>
      )}

      {entry.notes && (
        <div
          style={{
            marginTop: '6px',
            color: '#555555',
            fontSize: '9px',
            fontStyle: 'italic',
            lineHeight: 1.4,
          }}
        >
          {entry.notes}
        </div>
      )}

      <div
        style={{
          marginTop: '6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#333333', fontSize: '8px' }}>
          {formatDateTime(entry.createdAt)}
        </span>
        <button
          type="button"
          onClick={onDelete}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#333333',
            cursor: 'pointer',
            fontSize: '10px',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = '#f87171'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = '#333333'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// New-entry form. Self-contained state for direction / entry /
// stop / target / notes.
function NewEntryForm({
  onSubmit,
}: {
  onSubmit: (args: {
    direction: TradeDirection
    entry: number
    stop: number
    target: number
    notes: string
  }) => void
}) {
  const [direction, setDirection] = useState<TradeDirection>('LONG')
  const [entry, setEntry] = useState('')
  const [stop, setStop] = useState('')
  const [target, setTarget] = useState('')
  const [notes, setNotes] = useState('')

  function submit() {
    const e = parseFloat(entry)
    const s = parseFloat(stop)
    const t = parseFloat(target)
    if (!Number.isFinite(e) || !Number.isFinite(s) || !Number.isFinite(t)) return
    onSubmit({ direction, entry: e, stop: s, target: t, notes })
    setEntry('')
    setStop('')
    setTarget('')
    setNotes('')
  }

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #222222',
        flexShrink: 0,
      }}
    >
      <div style={{ ...labelStyle, marginBottom: '6px' }}>LOG TRADE</div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
        {(['LONG', 'SHORT'] as TradeDirection[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            style={{
              ...directionStyle(d, direction === d),
              flex: 1,
              fontSize: '9px',
              letterSpacing: '0.12em',
              padding: '5px 0',
              cursor: 'pointer',
            }}
          >
            {d === 'LONG' ? '▲ LONG' : '▼ SHORT'}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '6px',
          marginBottom: '6px',
        }}
      >
        {(
          [
            ['ENTRY', entry, setEntry],
            ['STOP', stop, setStop],
            ['TARGET', target, setTarget],
          ] as const
        ).map(([label, value, setter]) => (
          <div key={label}>
            <div style={labelStyle}>{label}</div>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setter(e.target.value)}
              style={{ ...inputStyle, marginTop: '2px' }}
            />
          </div>
        ))}
      </div>

      <textarea
        rows={2}
        placeholder="NOTES"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{
          ...inputStyle,
          resize: 'none',
          marginBottom: '6px',
          fontFamily: 'var(--font-mono)',
        }}
      />

      <button
        type="button"
        onClick={submit}
        className="terminal-btn"
        style={{
          width: '100%',
          height: '28px',
          background: '#0a1a0a',
          border: '1px solid #1a3a1a',
          color: '#4ade80',
          fontSize: '10px',
          fontFamily: 'var(--font-sans)',
          letterSpacing: '0.12em',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        LOG TRADE +
      </button>
    </div>
  )
}

// MEMORY tab — derived stats from analysis history. Renders an
// onboarding state until 5 outcomes are recorded; after that
// shows accuracy + per-session / per-confluence / per-entry-type
// breakdowns.
function MemoryTab({ patterns }: { patterns: PersonalPatterns | null }) {
  // Tab is loading — skeleton.
  if (!patterns) {
    return (
      <div style={{ padding: '20px 16px' }}>
        <div style={{ color: '#444444', fontSize: '10px' }}>Loading patterns...</div>
      </div>
    )
  }

  const onboarding = patterns.totalWithOutcome < 5

  if (onboarding) {
    return (
      <div style={{ padding: '20px 16px', textAlign: 'center' }}>
        <div style={{ color: '#fbbf24', fontSize: '24px', fontWeight: 500 }}>
          {patterns.totalWithOutcome}/5
        </div>
        <div style={{ color: '#444444', fontSize: '10px', marginTop: '4px' }}>
          outcomes recorded
        </div>
        <div
          style={{
            color: '#555555',
            fontSize: '9px',
            lineHeight: 1.5,
            marginTop: '12px',
          }}
        >
          Run 5 analyses and wait for outcomes to unlock your personal performance profile.
        </div>
      </div>
    )
  }

  const overallColor = accuracyColor(patterns.overallAccuracy)

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {/* OVERALL */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #222222' }}>
        <div style={labelStyle}>ACCURACY</div>
        <div
          style={{
            color: overallColor,
            fontSize: '28px',
            fontWeight: 500,
            marginTop: '2px',
          }}
        >
          {patterns.overallAccuracy}%
        </div>
        <div style={{ color: '#444444', fontSize: '9px', marginTop: '2px' }}>
          based on {patterns.totalWithOutcome} outcomes
        </div>
      </div>

      {/* INSIGHT */}
      {patterns.insight && (
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid #222222',
            background: '#161616',
          }}
        >
          <div style={{ color: '#888888', fontSize: '10px', lineHeight: 1.5 }}>
            {patterns.insight}
          </div>
        </div>
      )}

      {/* BY SESSION */}
      <div style={{ padding: '10px 16px 6px 16px' }}>
        <div style={labelStyle}>BY SESSION</div>
      </div>
      <div style={{ padding: '0 16px 8px 16px' }}>
        {Object.entries(patterns.bySession).length === 0 ? (
          <div style={{ color: '#333333', fontSize: '9px' }}>
            No session data yet.
          </div>
        ) : (
          Object.entries(patterns.bySession).map(([session, stats]) => (
            <AccuracyRow
              key={session}
              label={session}
              count={stats.count}
              accuracy={stats.accuracy}
              hasOutcomes={stats.count > 0}
            />
          ))
        )}
      </div>

      {/* BY CONFLUENCE */}
      <div style={{ padding: '10px 16px 6px 16px' }}>
        <div style={labelStyle}>BY CONFLUENCE SCORE</div>
      </div>
      <div style={{ padding: '0 16px 8px 16px' }}>
        {[5, 6, 7, 8].map((score) => {
          const stats = patterns.byConfluenceScore[score]
          if (!stats) return null
          return (
            <AccuracyRow
              key={score}
              label={`${score}/8`}
              count={stats.count}
              accuracy={stats.accuracy}
              hasOutcomes={stats.count > 0}
              highlight={patterns.bestConfluenceThreshold === score}
            />
          )
        })}
      </div>

      {/* BY ENTRY TYPE */}
      <div style={{ padding: '10px 16px 6px 16px' }}>
        <div style={labelStyle}>BY ENTRY TYPE</div>
      </div>
      <div style={{ padding: '0 16px 12px 16px' }}>
        {(['IDEAL', 'AGGRESSIVE', 'WAIT'] as const).map((type) => {
          const stats = patterns.byEntryType[type]
          return (
            <AccuracyRow
              key={type}
              label={type}
              count={stats?.count ?? 0}
              accuracy={stats?.accuracy ?? 0}
              hasOutcomes={!!stats && stats.count > 0}
            />
          )
        })}
      </div>
    </div>
  )
}

export default function JournalPanel({ isOpen, onClose }: JournalPanelProps) {
  const journal = useJournal()
  const history = useHistory()
  const goldPrice = useGoldPrice()
  const [activeTab, setActiveTab] = useState<'JOURNAL' | 'MEMORY'>('JOURNAL')

  // [PHASE-5] Trade-manager runs whenever the panel is mounted +
  // the price ticks. Mutations go through journal storage so the
  // chip rendered above re-flows naturally on the next refresh.
  // useGoldPrice is shared with the rest of the dashboard — no
  // duplicate polling.
  useTradeManager({
    entries: journal.entries,
    livePrice: goldPrice.data?.price ?? null,
    onUpdate: journal.refresh,
  })

  if (!isOpen) return null

  function handleAdd(args: {
    direction: TradeDirection
    entry: number
    stop: number
    target: number
    notes: string
  }) {
    journal.addEntry({
      ...args,
      session: getCurrentSession().name,
    })
  }

  return (
    <div
      data-section="journal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0, 0, 0, 0.7)',
      }}
    >
      <aside
        data-section="journal-panel"
        // [SPRINT-12] slide-in keyframe class for a consistent
        // enter animation across overlay surfaces (Journal +
        // Briefing). Lives in app/globals.css.
        className="slide-in"
        // Stop click propagation so clicking inside the panel
        // doesn't close it via the overlay's onClick.
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '380px',
          maxWidth: '100vw',
          background: '#111111',
          borderLeft: '1px solid #222222',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid #222222',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              color: '#e5e5e5',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            TRADE JOURNAL
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close journal"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#444444',
              cursor: 'pointer',
              fontSize: '14px',
              padding: 0,
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#e5e5e5'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#444444'
            }}
          >
            ✕
          </button>
        </div>

        {/* TAB SWITCHER */}
        <div style={{ display: 'flex', borderBottom: '1px solid #222222' }}>
          {(['JOURNAL', 'MEMORY'] as const).map((tab) => {
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '8px',
                  textAlign: 'center',
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #e5e5e5' : '2px solid transparent',
                  color: isActive ? '#e5e5e5' : '#444444',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {tab}
              </button>
            )
          })}
        </div>

        {/* TAB CONTENT */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeTab === 'JOURNAL' ? (
            <>
              <NewEntryForm onSubmit={handleAdd} />
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {journal.entries.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      color: '#333333',
                      fontSize: '10px',
                      padding: '40px 16px',
                    }}
                  >
                    No trades logged yet.
                  </div>
                ) : (
                  journal.entries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onClose={(exit) => journal.closeEntry(entry.id, exit)}
                      onDelete={() => journal.deleteEntry(entry.id)}
                    />
                  ))
                )}
              </div>
            </>
          ) : (
            <MemoryTab patterns={history.patterns} />
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            borderTop: '1px solid #222222',
            padding: '8px 16px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: '#333333', fontSize: '9px' }}>
            {journal.entries.length} trade{journal.entries.length === 1 ? '' : 's'}
          </span>
          <span style={{ color: '#222222', fontSize: '8px', letterSpacing: '0.1em' }}>
            localStorage
          </span>
        </div>
      </aside>
    </div>
  )
}
