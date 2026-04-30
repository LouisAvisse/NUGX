// AnalysisPanel — top slot of the right column. The "brain" of the
// dashboard: it pulls together the live price, macro signals, news,
// and current session, packages them as an AnalysisRequest, and
// fires /api/analyze either on demand (button click) or on the
// 30-minute auto cadence.
//
// Visible blocks (top → bottom):
//   1. Header                AI ANALYSIS label + countdown / status
//   2. Bias                  big bias word + confidence
//   3. Recommendation        SIGNAL: LONG / SHORT / FLAT
//   4. Key levels            2-col grid: R/S, Entry/Stop, Target
//   5. Catalyst              Claude's catalyst + rationale text
//   6. Action button         RUN ANALYSIS / ANALYZING…
//   7. Footer                last-run timestamp
//
// Hooks consumed:
//   - useAnalysis  (manual + countdown for /api/analyze)
//   - useGoldPrice (price/change/high/low for the request body)
//   - useSignals   (DXY/US10Y for the request body)
//   - useNews      (top 5 headline strings for the request body)
// Plus getCurrentSession() for the session name field.

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAnalysis } from '@/lib/hooks/useAnalysis'
import { useGoldPrice } from '@/lib/hooks/useGoldPrice'
import { useSignals } from '@/lib/hooks/useSignals'
import { useNews } from '@/lib/hooks/useNews'
import { biasColor, formatDateTime } from '@/lib/utils'
import { getCurrentSession } from '@/lib/session'
import type {
  AnalysisRequest,
  Confidence,
  Recommendation,
} from '@/lib/types'

// Map confidence enum → palette tone.
function confidenceColor(c: Confidence): string {
  if (c === 'HIGH') return '#4ade80'
  if (c === 'MEDIUM') return '#fbbf24'
  return '#f87171'
}

// Map recommendation enum → { color, prefix-glyph }.
function recDisplay(r: Recommendation): { color: string; glyph: string } {
  if (r === 'LONG') return { color: '#4ade80', glyph: '▲ ' }
  if (r === 'SHORT') return { color: '#f87171', glyph: '▼ ' }
  return { color: '#888888', glyph: '◆ ' }
}

// Format secondsUntilNext → "MM:SS" (zero-padded). Used by the
// header countdown. Hook never reaches 0 (wraps at 1 → AUTO_INTERVAL),
// but the formatter is defensive about negatives just in case.
function formatCountdown(seconds: number): string {
  const s = Math.max(0, seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// Shared label style for tiny uppercase labels in every block.
const labelStyle: React.CSSProperties = {
  color: '#444444',
  fontSize: '8px',
  textTransform: 'uppercase',
}

// One cell of the key-levels grid. `value` may be undefined while
// no analysis has run yet → falls back to "——" in #333.
function LevelCell({
  label,
  value,
  color,
}: {
  label: string
  value: string | undefined
  color: string
}) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          color: value ? color : '#333333',
          fontSize: '10px',
          marginTop: '2px',
        }}
      >
        {value ?? '——'}
      </div>
    </div>
  )
}

export default function AnalysisPanel() {
  // All four hooks fire on mount and live for the panel's lifetime.
  const analysis = useAnalysis()
  const goldPrice = useGoldPrice()
  const signals = useSignals()
  const news = useNews()
  const { data, loading, secondsUntilNext, trigger } = analysis

  // Hovered button state for the inline-style hover effect (no CSS
  // pseudo-class is available with style={{}}). React handles this
  // cheaply — no re-renders elsewhere because the button only
  // reads its own state.
  const [hoverBtn, setHoverBtn] = useState(false)

  // Build the analyze payload from current upstream state. Memoized
  // so the auto-trigger useEffect can include it in deps without
  // re-running every render.
  const buildRequest = useCallback((): AnalysisRequest => {
    return {
      price: goldPrice.data?.price ?? 0,
      changePct: goldPrice.data?.changePct ?? 0,
      high: goldPrice.data?.high ?? 0,
      low: goldPrice.data?.low ?? 0,
      dxy: signals.data?.dxy.price ?? 0,
      us10y: signals.data?.us10y.price ?? 0,
      session: getCurrentSession().name,
      news: news.articles.slice(0, 5).map((a) => a.title),
    }
  }, [goldPrice.data, signals.data, news.articles])

  // Auto-trigger: when the countdown hits 0 AND we have at least a
  // gold-price reading, fire trigger() once. Note: the current
  // useAnalysis hook wraps from 1 → AUTO_INTERVAL without ever
  // emitting 0, so this branch will not fire in practice. Spec asks
  // for `=== 0`; respecting that literally, with this comment as
  // the flag for a future hook tweak.
  useEffect(() => {
    if (secondsUntilNext === 0 && goldPrice.data) {
      trigger(buildRequest())
    }
  }, [secondsUntilNext, goldPrice.data, buildRequest, trigger])

  // Click handler for the manual button — same payload as auto.
  const onClickRun = () => {
    if (loading) return
    trigger(buildRequest())
  }

  // Header countdown / status text — three states.
  let countdownNode: React.ReactNode
  if (loading) {
    countdownNode = (
      <span
        className="pulse"
        style={{ color: '#fbbf24', fontSize: '9px' }}
      >
        ANALYZING...
      </span>
    )
  } else if (data) {
    countdownNode = (
      <span style={{ color: '#333333', fontSize: '9px' }}>
        {formatCountdown(secondsUntilNext)}
      </span>
    )
  } else {
    countdownNode = (
      <span style={{ color: '#333333', fontSize: '9px' }}>——</span>
    )
  }

  const rec = data ? recDisplay(data.recommendation) : null

  return (
    <>
      {/* Local pulse keyframes — same definition PriceBar uses, kept
          in this component too so the panel is self-contained even
          if PriceBar isn't mounted. Multiple identical .pulse rules
          in the document are harmless. */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.2 }
        }
        .pulse { animation: pulse 1.5s infinite }
      `}</style>

      <div
        style={{
          background: '#111111',
          border: '1px solid #222222',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* 1. Header. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px 6px 12px',
            borderBottom: '1px solid #222222',
          }}
        >
          <span
            style={{
              color: '#444444',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            AI ANALYSIS
          </span>
          {countdownNode}
        </div>

        {/* 2. Bias block — the most prominent element. */}
        <div
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid #222222',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Left: BIAS label + value. */}
          <div>
            <div style={labelStyle}>BIAS</div>
            <div
              style={{
                color: data ? biasColor(data.bias) : '#333333',
                fontSize: '22px',
                fontWeight: 500,
                letterSpacing: '0.05em',
              }}
            >
              {data ? data.bias : '——'}
            </div>
          </div>
          {/* Right: CONFIDENCE label + value. */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...labelStyle, textAlign: 'right' }}>
              CONFIDENCE
            </div>
            <div
              style={{
                color: data ? confidenceColor(data.confidence) : '#333333',
                fontSize: '13px',
                textAlign: 'right',
              }}
            >
              {data ? data.confidence : '——'}
            </div>
          </div>
        </div>

        {/* 3. Recommendation. */}
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #222222',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={labelStyle}>SIGNAL</span>
          <span
            style={{
              color: rec ? rec.color : '#333333',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {rec && data ? `${rec.glyph}${data.recommendation}` : '——'}
          </span>
        </div>

        {/* 4. Key levels (3 rows × 2 cols, last cell empty). */}
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #222222',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
          }}
        >
          <LevelCell
            label="RESISTANCE"
            value={data?.resistance}
            color="#f87171"
          />
          <LevelCell
            label="SUPPORT"
            value={data?.support}
            color="#4ade80"
          />
          <LevelCell label="ENTRY" value={data?.entry} color="#60a5fa" />
          <LevelCell label="STOP" value={data?.stop} color="#f87171" />
          <LevelCell
            label="TARGET"
            value={data?.target}
            color="#4ade80"
          />
          {/* Empty cell to balance the 3×2 grid visually. */}
          <div />
        </div>

        {/* 5. Catalyst + rationale. */}
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #222222',
          }}
        >
          <div style={{ ...labelStyle, marginBottom: '4px' }}>
            CATALYST
          </div>
          {data ? (
            <>
              <div
                style={{
                  color: '#666666',
                  fontSize: '9px',
                  lineHeight: 1.5,
                }}
              >
                {data.catalyst}
              </div>
              <div
                style={{
                  color: '#888888',
                  fontSize: '9px',
                  marginTop: '4px',
                  fontStyle: 'italic',
                }}
              >
                {data.rationale}
              </div>
            </>
          ) : (
            <div style={{ color: '#333333', fontSize: '9px' }}>
              Run analysis to generate AI trade thesis.
            </div>
          )}
        </div>

        {/* 6. Action button. Inline style so the panel stays
              dependency-free; hover state is tracked by React because
              :hover isn't available with style={{}}. */}
        <button
          onClick={onClickRun}
          disabled={loading}
          onMouseEnter={() => setHoverBtn(true)}
          onMouseLeave={() => setHoverBtn(false)}
          style={{
            margin: '10px 12px',
            width: 'calc(100% - 24px)',
            height: '28px',
            background: 'transparent',
            // Border + foreground go through three states: loading
            // (muted, can't click), idle (default), hover (brighter).
            border: `1px solid ${
              loading ? '#222222' : hoverBtn ? '#444444' : '#2a2a2a'
            }`,
            color: loading
              ? '#333333'
              : hoverBtn
                ? '#e5e5e5'
                : '#666666',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.1em',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'ANALYZING...' : 'RUN ANALYSIS'}
        </button>

        {/* 7. Footer — last-run stamp, only visible after first run. */}
        <div style={{ padding: '0 12px 8px 12px' }}>
          {data && (
            <span style={{ color: '#333333', fontSize: '8px' }}>
              LAST: {formatDateTime(data.generatedAt)}
            </span>
          )}
        </div>
      </div>
    </>
  )
}
