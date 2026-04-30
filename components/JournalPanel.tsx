// JournalPanel — slide-in trade journal, opened from PriceBar.
//
// Renders as an overlay above the dashboard (z-index 50), it
// does not push or resize the existing layout. Full panel layout:
//
//   ┌──────────────────────────────────────────┐
//   │ Header: TRADE JOURNAL              ✕    │ flex-shrink:0
//   ├──────────────────────────────────────────┤
//   │ Form: direction toggle + entry/stop/    │ flex-shrink:0
//   │ target inputs + notes + LOG TRADE +     │
//   ├──────────────────────────────────────────┤
//   │                                          │
//   │ Entry list (scrollable)                 │ flex:1, scrolls
//   │  · LONG  3284 / 3265 / 3320  …          │
//   │  · SHORT 3290 / 3300 / 3270  …          │
//   │                                          │
//   ├──────────────────────────────────────────┤
//   │ Footer: N TRADES LOGGED · localStorage   │ flex-shrink:0
//   └──────────────────────────────────────────┘
//
// All journal IO goes through useJournal — components must not
// touch lib/journal.ts directly to keep state and localStorage
// in sync.

'use client'

import { useState } from 'react'
import { useJournal } from '@/lib/hooks/useJournal'
import { calculatePnL, formatPnL } from '@/lib/journal'
import { formatPrice, formatDateTime } from '@/lib/utils'
import { getCurrentSession } from '@/lib/session'
import type { JournalEntry, TradeDirection } from '@/lib/types'

interface JournalPanelProps {
  isOpen: boolean
  onClose: () => void
}

// Tiny uppercase label tone — reused for every form/cell label.
const labelStyle: React.CSSProperties = {
  color: '#444444',
  fontSize: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

// Shared input chrome for the form's number / textarea cells.
const inputStyle: React.CSSProperties = {
  background: '#0a0a0a',
  border: '1px solid #222222',
  color: '#e5e5e5',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  padding: '4px 6px',
  width: '100%',
}

// Shared button chrome — same look as the AnalysisPanel button.
const buttonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #2a2a2a',
  color: '#666666',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  letterSpacing: '0.1em',
  cursor: 'pointer',
  height: '28px',
}

// Direction toggle button — colored when active per the spec.
function DirectionButton({
  value,
  current,
  onClick,
}: {
  value: TradeDirection
  current: TradeDirection
  onClick: () => void
}) {
  const active = value === current
  const isLong = value === 'LONG'
  // Active = colored bg + matching text; inactive = transparent + #444.
  const activeStyle: React.CSSProperties = isLong
    ? { background: '#0a1f0a', color: '#4ade80', border: '1px solid #1a4a1a' }
    : { background: '#1f0a0a', color: '#f87171', border: '1px solid #4a1a1a' }
  const inactiveStyle: React.CSSProperties = {
    background: 'transparent',
    color: '#444444',
    border: '1px solid #222222',
  }
  return (
    <button
      className="terminal-btn"
      onClick={onClick}
      style={{
        ...(active ? activeStyle : inactiveStyle),
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        padding: '4px 10px',
        cursor: 'pointer',
      }}
    >
      {isLong ? '▲ LONG' : '▼ SHORT'}
    </button>
  )
}

// One entry card — manages its own exitValue input state so the
// parent doesn't have to track a Map<id, string>.
function EntryCard({
  entry,
  onClose,
  onDelete,
}: {
  entry: JournalEntry
  onClose: (id: string, exitPrice: number) => void
  onDelete: (id: string) => void
}) {
  const [exitValue, setExitValue] = useState('')

  const isClosed = typeof entry.exitPrice === 'number'

  return (
    <div
      style={{
        margin: '0 8px 6px 8px',
        padding: '10px 12px',
        background: '#161616',
        border: '1px solid #222222',
      }}
    >
      {/* Top row — direction badge + session label. */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span
          style={{
            color: entry.direction === 'LONG' ? '#4ade80' : '#f87171',
            fontSize: '10px',
          }}
        >
          {entry.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'}
        </span>
        <span style={{ color: '#444444', fontSize: '9px' }}>
          {entry.session}
        </span>
      </div>

      {/* Price row — entry/stop/target side by side. */}
      <div
        style={{
          marginTop: '6px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '4px',
        }}
      >
        <div>
          <div style={labelStyle}>ENTRY</div>
          <div style={{ color: '#e5e5e5', fontSize: '10px' }}>
            {formatPrice(entry.entry)}
          </div>
        </div>
        <div>
          <div style={labelStyle}>STOP</div>
          <div style={{ color: '#e5e5e5', fontSize: '10px' }}>
            {formatPrice(entry.stop)}
          </div>
        </div>
        <div>
          <div style={labelStyle}>TARGET</div>
          <div style={{ color: '#e5e5e5', fontSize: '10px' }}>
            {formatPrice(entry.target)}
          </div>
        </div>
      </div>

      {/* CLOSED row OR close-trade controls — mutually exclusive. */}
      {isClosed ? (
        <div
          style={{
            marginTop: '6px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span style={labelStyle}>CLOSED</span>
          {(() => {
            const pnl = calculatePnL(
              entry.entry,
              entry.exitPrice as number,
              entry.direction
            )
            return (
              <span
                style={{
                  color: pnl >= 0 ? '#4ade80' : '#f87171',
                  fontSize: '10px',
                }}
              >
                {formatPnL(pnl)}
              </span>
            )
          })()}
        </div>
      ) : (
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <input
            type="number"
            step="0.01"
            placeholder="Exit price"
            value={exitValue}
            onChange={(e) => setExitValue(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            className="terminal-btn"
            onClick={() => {
              const n = parseFloat(exitValue)
              if (!Number.isFinite(n)) return
              onClose(entry.id, n)
            }}
            style={{ ...buttonStyle, width: 'auto', padding: '4px 8px' }}
          >
            CLOSE
          </button>
        </div>
      )}

      {/* Notes (optional). */}
      {entry.notes && (
        <div
          style={{
            marginTop: '6px',
            color: '#555555',
            fontSize: '9px',
            fontStyle: 'italic',
          }}
        >
          {entry.notes}
        </div>
      )}

      {/* Created timestamp. */}
      <div style={{ marginTop: '6px', color: '#333333', fontSize: '8px' }}>
        {formatDateTime(entry.createdAt)}
      </div>

      {/* Delete affordance. */}
      <button
        className="terminal-btn"
        onClick={() => onDelete(entry.id)}
        style={{
          marginTop: '6px',
          background: 'transparent',
          border: 'none',
          color: '#333333',
          fontSize: '8px',
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          letterSpacing: '0.05em',
        }}
      >
        DELETE
      </button>
    </div>
  )
}

export default function JournalPanel({ isOpen, onClose }: JournalPanelProps) {
  const { entries, addEntry, closeEntry, removeEntry } = useJournal()

  // Form-local state — reset to defaults after a successful submit.
  const [direction, setDirection] = useState<TradeDirection>('LONG')
  const [entry, setEntry] = useState('')
  const [stop, setStop] = useState('')
  const [target, setTarget] = useState('')
  const [notes, setNotes] = useState('')

  if (!isOpen) return null

  const onSubmit = () => {
    const eN = parseFloat(entry)
    const sN = parseFloat(stop)
    const tN = parseFloat(target)
    // Validate all three are real numbers — ignore the click otherwise.
    if (![eN, sN, tN].every(Number.isFinite)) return
    addEntry({
      direction,
      entry: eN,
      stop: sN,
      target: tN,
      session: getCurrentSession().name,
      notes,
    })
    // Reset form.
    setDirection('LONG')
    setEntry('')
    setStop('')
    setTarget('')
    setNotes('')
  }

  return (
    <div
      // Overlay: fixed full-viewport, dim the dashboard behind.
      // Click on the dim area closes the panel; click on the
      // panel itself doesn't bubble.
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0, 0, 0, 0.6)',
      }}
      onClick={onClose}
    >
      <div
        // Panel: anchored to the right edge, full height, 360px wide.
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '360px',
          background: '#111111',
          borderLeft: '1px solid #222222',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* A. Header. */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid #222222',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
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
            className="terminal-btn"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#444444',
              fontSize: '14px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e5e5e5')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#444444')}
          >
            ✕
          </button>
        </div>

        {/* B. New entry form. */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #222222',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              ...labelStyle,
              fontSize: '9px',
              letterSpacing: '0.12em',
              marginBottom: '4px',
            }}
          >
            LOG TRADE
          </div>

          {/* Direction toggle. */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <DirectionButton
              value="LONG"
              current={direction}
              onClick={() => setDirection('LONG')}
            />
            <DirectionButton
              value="SHORT"
              current={direction}
              onClick={() => setDirection('SHORT')}
            />
          </div>

          {/* Entry / stop / target — three side-by-side number inputs. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '6px',
            }}
          >
            <div>
              <div style={labelStyle}>ENTRY</div>
              <input
                type="number"
                step="0.01"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>STOP</div>
              <input
                type="number"
                step="0.01"
                value={stop}
                onChange={(e) => setStop(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>TARGET</div>
              <input
                type="number"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Notes — full-width textarea. */}
          <div>
            <div style={labelStyle}>NOTES</div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...inputStyle, resize: 'none' }}
            />
          </div>

          {/* Submit. */}
          <button
            className="terminal-btn"
            onClick={onSubmit}
            style={{ ...buttonStyle, width: '100%' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#444444'
              e.currentTarget.style.color = '#e5e5e5'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#2a2a2a'
              e.currentTarget.style.color = '#666666'
            }}
          >
            LOG TRADE +
          </button>
        </div>

        {/* C. Entries list — flex:1, scrolls internally. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {entries.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                color: '#333333',
                fontSize: '10px',
                textAlign: 'center',
              }}
            >
              No trades logged yet.
            </div>
          ) : (
            entries.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                onClose={closeEntry}
                onDelete={removeEntry}
              />
            ))
          )}
        </div>

        {/* D. Footer. */}
        <div
          style={{
            borderTop: '1px solid #222222',
            padding: '8px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#333333', fontSize: '9px' }}>
            {entries.length} TRADES LOGGED
          </span>
          <span style={{ color: '#222222', fontSize: '8px' }}>
            localStorage
          </span>
        </div>
      </div>
    </div>
  )
}
