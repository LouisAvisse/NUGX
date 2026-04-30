// AnalysisPanel — top slot of the right column. The "brain" of
// the dashboard: pulls live price + macro signals + news + session
// into an AnalysisRequest and fires /api/analyze either on demand
// (button click) or on the 30-minute auto cadence.
//
// Render branches:
//   loading                → shimmer skeletons in bias/conf/levels/catalyst
//   error                  → "ANALYSIS FAILED" banner; "——" in
//                             bias/levels; button text RETRY ANALYSIS
//   data                   → real bias / levels / catalyst
//   neither                → empty-state hint
//
// Pulse + shimmer keyframes live in app/globals.css now — no
// component-local <style> tag.

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

function confidenceColor(c: Confidence): string {
  if (c === 'HIGH') return '#4ade80'
  if (c === 'MEDIUM') return '#fbbf24'
  return '#f87171'
}

function recDisplay(r: Recommendation): { color: string; glyph: string } {
  if (r === 'LONG') return { color: '#4ade80', glyph: '▲ ' }
  if (r === 'SHORT') return { color: '#f87171', glyph: '▼ ' }
  return { color: '#888888', glyph: '◆ ' }
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const labelStyle: React.CSSProperties = {
  color: '#444444',
  fontSize: '8px',
  textTransform: 'uppercase',
}

// Shared shimmer bar — width/height per call site.
function Skeleton({
  width,
  height,
  widthPct,
}: {
  width?: number
  height: number
  widthPct?: string
}) {
  return (
    <div
      className="shimmer"
      style={{
        width: widthPct ?? `${width}px`,
        height: `${height}px`,
        background: '#1a1a1a',
        borderRadius: '2px',
      }}
    />
  )
}

// One cell of the key-levels grid. While loading, renders a
// shimmer in place of the value. While in error state, shows
// "——" #333. Otherwise the typed value at its semantic color.
function LevelCell({
  label,
  value,
  color,
  loading,
}: {
  label: string
  value: string | undefined
  color: string
  loading: boolean
}) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {loading ? (
        <div style={{ marginTop: '2px' }}>
          <Skeleton width={55} height={10} />
        </div>
      ) : (
        <div
          style={{
            color: value ? color : '#333333',
            fontSize: '10px',
            marginTop: '2px',
          }}
        >
          {value ?? '——'}
        </div>
      )}
    </div>
  )
}

export default function AnalysisPanel() {
  const analysis = useAnalysis()
  const goldPrice = useGoldPrice()
  const signals = useSignals()
  const news = useNews()
  const { data, loading, error, secondsUntilNext, trigger } = analysis

  const [hoverBtn, setHoverBtn] = useState(false)

  // Fade-in on every fresh analysis result. Watching generatedAt
  // means even an "identical-looking" follow-up still flashes.
  const [fadeClass, setFadeClass] = useState('')
  useEffect(() => {
    if (!data) return
    setFadeClass('fade-in')
    const timer = setTimeout(() => setFadeClass(''), 300)
    return () => clearTimeout(timer)
  }, [data?.generatedAt])

  // Build the analyze payload from current upstream state.
  // The technicals and calendar fields are stubbed with safe
  // defaults until useTechnicals + useCalendar exist (steps B-D
  // of the resume plan in the [#26] close-out report). Once
  // those hooks ship, replace the stubs with the real values.
  // News sentiment counts derive from articles[].sentiment when
  // present; missing sentiment falls into NEUTRAL.
  const buildRequest = useCallback((): AnalysisRequest => {
    const session = getCurrentSession()
    const articles = news.articles
    const newsBullishCount = articles.filter(
      (a) => a.sentiment === 'BULLISH'
    ).length
    const newsBearishCount = articles.filter(
      (a) => a.sentiment === 'BEARISH'
    ).length
    // Treat missing sentiment as NEUTRAL so the counts always sum
    // to articles.length.
    const newsNeutralCount = articles.length - newsBullishCount - newsBearishCount

    return {
      // Price
      price: goldPrice.data?.price ?? 0,
      changePct: goldPrice.data?.changePct ?? 0,
      high: goldPrice.data?.high ?? 0,
      low: goldPrice.data?.low ?? 0,
      open: goldPrice.data?.open ?? 0,

      // Technical indicators — stubbed until useTechnicals exists.
      // 50 for RSI is the neutral midpoint; 0/'NONE'/'NEUTRAL' for
      // the rest. The Claude prompt will explicitly note these
      // signals as "unknown — score NEUTRAL" while the hook ships.
      ema20: 0,
      ema50: 0,
      ema200: 0,
      rsi: 50,
      macd: 0,
      macdSignal: 0,
      macdHistogram: 0,
      macdCross: 'NONE',
      atr: 0,
      bbUpper: 0,
      bbLower: 0,
      swingHigh: 0,
      swingLow: 0,
      trend: 'RANGING',
      rsiZone: 'NEUTRAL',
      dayRangePct: 50,
      priceVsEma20: 'ABOVE',
      priceVsEma50: 'ABOVE',
      priceVsEma200: 'ABOVE',

      // Macro
      dxy: signals.data?.dxy.price ?? 0,
      dxyChangePct: signals.data?.dxy.changePct ?? 0,
      us10y: signals.data?.us10y.price ?? 0,
      us10yChangePct: signals.data?.us10y.changePct ?? 0,

      // Session
      session: session.name,
      sessionIsHighVolatility: session.isHighVolatility,

      // Calendar — clearToTrade defaults true so the panel doesn't
      // gate analysis off until useCalendar exists. Once the hook
      // ships, replace with calendar.data?.* reads.
      clearToTrade: true,
      warningMessage: null,
      nextEventTitle: null,
      nextEventMinutes: null,

      // News sentiment
      newsBullishCount,
      newsBearishCount,
      newsNeutralCount,
      topHeadlines: articles.slice(0, 6).map((a) => a.title),
    }
  }, [goldPrice.data, signals.data, news.articles])

  // Auto-trigger when the countdown wraps. Note: useAnalysis
  // wraps from 1 → AUTO_INTERVAL without ever emitting 0, so
  // this check matches the spec text but doesn't fire in
  // practice. Future hook tweak should let it pass through 0.
  useEffect(() => {
    if (secondsUntilNext === 0 && goldPrice.data) {
      trigger(buildRequest())
    }
  }, [secondsUntilNext, goldPrice.data, buildRequest, trigger])

  const onClickRun = () => {
    if (loading) return
    trigger(buildRequest())
  }

  // Header right node — three states:
  //   loading       → ANALYZING… pulse
  //   data present  → MM:SS countdown
  //   neither       → "——"
  let countdownNode: React.ReactNode
  if (loading) {
    countdownNode = (
      <span className="pulse" style={{ color: '#fbbf24', fontSize: '9px' }}>
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

  // True when the panel should show shimmer placeholders for
  // bias / confidence / levels / catalyst (active fetch in flight).
  const showSkeleton = loading

  // True when the panel should show the error banner. Spec says
  // "error !== null and !loading" — loading takes priority.
  const showError = !loading && !!error

  return (
    <div
      style={{
        background: '#111111',
        border: '1px solid #222222',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Header. */}
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

      {/* Bias block — flashClass gives a 300ms fade-in on every
          fresh analysis result (driven by data.generatedAt). */}
      <div
        className={fadeClass}
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #222222',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={labelStyle}>BIAS</div>
          {showSkeleton ? (
            <div style={{ marginTop: '2px' }}>
              <Skeleton width={100} height={22} />
            </div>
          ) : (
            <div
              style={{
                color:
                  showError
                    ? '#333333'
                    : data
                      ? biasColor(data.bias)
                      : '#333333',
                fontSize: '22px',
                fontWeight: 500,
                letterSpacing: '0.05em',
              }}
            >
              {showError ? '——' : data ? data.bias : '——'}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...labelStyle, textAlign: 'right' }}>CONFIDENCE</div>
          {showSkeleton ? (
            <div
              style={{
                marginTop: '2px',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <Skeleton width={50} height={13} />
            </div>
          ) : (
            <div
              style={{
                color:
                  showError
                    ? '#333333'
                    : data
                      ? confidenceColor(data.confidence)
                      : '#333333',
                fontSize: '13px',
                textAlign: 'right',
              }}
            >
              {showError ? '——' : data ? data.confidence : '——'}
            </div>
          )}
        </div>
      </div>

      {/* Recommendation. */}
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
        {showSkeleton ? (
          <Skeleton width={70} height={12} />
        ) : (
          <span
            style={{
              color: showError ? '#333333' : rec ? rec.color : '#333333',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {showError ? '——' : rec && data ? `${rec.glyph}${data.recommendation}` : '——'}
          </span>
        )}
      </div>

      {/* Key levels grid. */}
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
          value={showError ? undefined : data?.resistance}
          color="#f87171"
          loading={showSkeleton}
        />
        <LevelCell
          label="SUPPORT"
          value={showError ? undefined : data?.support}
          color="#4ade80"
          loading={showSkeleton}
        />
        <LevelCell
          label="ENTRY"
          value={showError ? undefined : data?.entry}
          color="#60a5fa"
          loading={showSkeleton}
        />
        <LevelCell
          label="STOP"
          value={showError ? undefined : data?.stop}
          color="#f87171"
          loading={showSkeleton}
        />
        <LevelCell
          label="TARGET"
          value={showError ? undefined : data?.target}
          color="#4ade80"
          loading={showSkeleton}
        />
        <div />
      </div>

      {/* Catalyst block — three branches. */}
      <div
        style={{ padding: '8px 12px', borderBottom: '1px solid #222222' }}
      >
        <div style={{ ...labelStyle, marginBottom: '4px' }}>CATALYST</div>
        {showSkeleton ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton widthPct="90%" height={8} />
            <Skeleton widthPct="75%" height={8} />
            <Skeleton widthPct="60%" height={8} />
          </div>
        ) : showError ? (
          <>
            <div style={{ color: '#f87171', fontSize: '10px' }}>
              ANALYSIS FAILED
            </div>
            <div
              style={{
                color: '#444444',
                fontSize: '9px',
                marginTop: '4px',
              }}
            >
              Check API key and retry.
            </div>
          </>
        ) : data ? (
          <>
            <div
              style={{ color: '#666666', fontSize: '9px', lineHeight: 1.5 }}
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

      {/* Action button. RETRY ANALYSIS in error state, otherwise
          RUN ANALYSIS / ANALYZING…. Always enabled in error state. */}
      <button
        className="terminal-btn"
        onClick={onClickRun}
        disabled={loading}
        onMouseEnter={() => setHoverBtn(true)}
        onMouseLeave={() => setHoverBtn(false)}
        style={{
          margin: '10px 12px',
          width: 'calc(100% - 24px)',
          height: '28px',
          background: 'transparent',
          border: `1px solid ${
            loading ? '#222222' : hoverBtn ? '#444444' : '#2a2a2a'
          }`,
          color: loading ? '#333333' : hoverBtn ? '#e5e5e5' : '#666666',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.1em',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading
          ? 'ANALYZING...'
          : showError
            ? 'RETRY ANALYSIS'
            : 'RUN ANALYSIS'}
      </button>

      {/* Footer. */}
      <div style={{ padding: '0 12px 8px 12px' }}>
        {data && !showError && (
          <span style={{ color: '#333333', fontSize: '8px' }}>
            LAST: {formatDateTime(data.generatedAt)}
          </span>
        )}
      </div>
    </div>
  )
}
