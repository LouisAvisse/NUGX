// BriefingModal — full-screen overlay showing the day's London
// session briefing. Five sections: OVERNIGHT / KEY LEVELS /
// CALENDAR / BIAS / WATCH FOR. Auto-opens when a new briefing
// is generated; can be opened manually via the BRIEFING button
// in PriceBar.

'use client'

import { formatDateTime } from '@/lib/utils'
import type { Bias, SessionBriefing } from '@/lib/types'

interface BriefingModalProps {
  briefing: SessionBriefing | null
  isGenerating: boolean
  isOpen: boolean
  onClose: () => void
}

// Bias badge palette — matches the AnalysisPanel/JournalPanel
// vocabulary so the trader recognises the colours instantly.
function biasStyle(bias: Bias): React.CSSProperties {
  if (bias === 'BULLISH') {
    return { background: '#0a1a0a', color: '#4ade80' }
  }
  if (bias === 'BEARISH') {
    return { background: '#1a0a0a', color: '#f87171' }
  }
  return { background: '#1a1500', color: '#fbbf24' }
}

const labelStyle: React.CSSProperties = {
  color: '#444444',
  fontSize: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: '4px',
}

export default function BriefingModal({
  briefing,
  isGenerating,
  isOpen,
  onClose,
}: BriefingModalProps) {
  if (!isOpen) return null

  const content = briefing?.content
  // Heuristic for highlighting the calendar section: contains
  // any HIGH-impact keywords. Cheap and good enough.
  const calendarHasHighImpact =
    !!content?.calendarRisk &&
    /(FOMC|CPI|NFP|Fed|payrolls|inflation|rate|FOMC)/i.test(content.calendarRisk)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '480px',
          maxWidth: '100%',
          maxHeight: '80vh',
          background: '#111111',
          border: '1px solid #222222',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #222222',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                color: '#e5e5e5',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              LONDON SESSION BRIEFING
            </div>
            {briefing && (
              <div style={{ color: '#444444', fontSize: '9px', marginTop: '2px' }}>
                {formatDateTime(briefing.generatedAt)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {content && (
              <span
                style={{
                  ...biasStyle(content.bias),
                  fontSize: '9px',
                  padding: '3px 8px',
                  letterSpacing: '0.1em',
                }}
              >
                {content.bias}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close briefing"
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
        </div>

        {/* CONTENT */}
        {isGenerating && !content ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div
              className="pulse"
              style={{ color: '#fbbf24', fontSize: '11px', letterSpacing: '0.1em' }}
            >
              GENERATING BRIEFING...
            </div>
            <div
              style={{
                color: '#444444',
                fontSize: '9px',
                marginTop: '8px',
                lineHeight: 1.5,
              }}
            >
              Analyzing overnight session and today&apos;s calendar...
            </div>
          </div>
        ) : content ? (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* OVERNIGHT */}
            <Section
              label="OVERNIGHT"
              body={content.overnightSummary}
              bodyColor="#888888"
            />
            {/* KEY LEVELS */}
            <Section
              label="KEY LEVELS"
              body={content.keyLevels}
              bodyColor="#888888"
            />
            {/* CALENDAR */}
            <Section
              label="CALENDAR"
              body={content.calendarRisk}
              bodyColor={calendarHasHighImpact ? '#fbbf24' : '#888888'}
            />
            {/* BIAS */}
            <Section
              label="BIAS"
              body={content.sessionBias}
              bodyColor="#e5e5e5"
              bodyWeight={500}
              bodySize="11px"
            />
            {/* WATCH FOR — green-tinted background to call out
                the most important section of the briefing. */}
            <div
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid #1a1a1a',
                background: '#0a1a0a',
              }}
            >
              <div style={{ ...labelStyle, color: '#4ade80' }}>WATCH FOR</div>
              <div style={{ color: '#4ade80', fontSize: '10px', lineHeight: 1.6 }}>
                {content.watchFor}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ color: '#444444', fontSize: '10px' }}>
              No briefing available yet.
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div
          style={{
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid #1a1a1a',
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#333333', fontSize: '8px' }}>
            {briefing
              ? `Generated at ${formatDateTime(briefing.generatedAt)}`
              : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="terminal-btn"
            style={{
              background: 'transparent',
              border: '1px solid #2a2a2a',
              color: '#e5e5e5',
              fontSize: '9px',
              letterSpacing: '0.1em',
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  )
}

// One labelled section in the briefing body — keeps padding /
// border / label styling consistent.
function Section({
  label,
  body,
  bodyColor,
  bodyWeight,
  bodySize,
}: {
  label: string
  body: string
  bodyColor: string
  bodyWeight?: number
  bodySize?: string
}) {
  return (
    <div
      style={{
        padding: '12px 20px',
        borderBottom: '1px solid #1a1a1a',
      }}
    >
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          color: bodyColor,
          fontSize: bodySize ?? '10px',
          lineHeight: 1.6,
          fontWeight: bodyWeight,
        }}
      >
        {body}
      </div>
    </div>
  )
}
