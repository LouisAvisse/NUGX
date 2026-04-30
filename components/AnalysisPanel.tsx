// AnalysisPanel — the COPILOT trade card. Top slot of the right
// column. Visual surface for the confluence engine in
// /api/analyze ([#32] Marcus Reid persona).
//
// Render branches by hook state:
//   loading                → shimmer skeletons in every block
//   error                  → "ANALYSIS FAILED" banner + RETRY button
//   data                   → full Marcus Reid trade card
//   neither                → empty-state hint
//
// Layout (top → bottom):
//   1. Header bar          COPILOT | market condition badge | countdown
//   2. Calendar banner     (conditional — warning copy + amber/red tint)
//   3. Recommendation      LONG/SHORT/FLAT (large) + bias badge stack
//                            + entryTiming + entryType badge
//   4. Trade parameters    ENTRY/STOP/TARGET grid; R:R + HOLD row;
//                            INVALIDATION row
//   5. Confluence          score N/8 + 8-block bar + 8-signal grid
//   6. Catalyst            NOW / RISK / TRIGGER + exitPlan
//   7. Action button       RUN / RETRY / ANALYZING / CALENDAR BLOCK
//   8. Footer              LAST analysis time | TA last update time

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnalysis } from '@/lib/hooks/useAnalysis'
import { useGoldPrice } from '@/lib/hooks/useGoldPrice'
import { useSignals } from '@/lib/hooks/useSignals'
import { useNews } from '@/lib/hooks/useNews'
import { useTechnicals } from '@/lib/hooks/useTechnicals'
import { useCalendar } from '@/lib/hooks/useCalendar'
import { biasColor, formatDateTime } from '@/lib/utils'
import { getCurrentSession } from '@/lib/session'
import type {
  AnalysisRequest,
  Bias,
  Confidence,
  EntryType,
  MarketCondition,
  Recommendation,
  SignalBreakdown,
} from '@/lib/types'

// ─────────────────────────────────────────────────────────────────
// Color + glyph helpers
// ─────────────────────────────────────────────────────────────────

function confidenceColor(c: Confidence): string {
  if (c === 'HIGH') return '#4ade80'
  if (c === 'MEDIUM') return '#fbbf24'
  return '#f87171'
}

function recDisplay(r: Recommendation): {
  color: string
  glyph: string
  text: string
} {
  if (r === 'LONG') return { color: '#4ade80', glyph: '▲', text: 'LONG' }
  if (r === 'SHORT') return { color: '#f87171', glyph: '▼', text: 'SHORT' }
  return { color: '#b0b0b0', glyph: '◆', text: 'FLAT' }
}

// Bias badge palette — used by the small badge in the
// recommendation block (right side).
function biasBadgeStyle(bias: Bias): React.CSSProperties {
  const palette =
    bias === 'BULLISH'
      ? { background: '#0a1a0a', color: '#4ade80', border: '1px solid #1a3a1a' }
      : bias === 'BEARISH'
        ? { background: '#1a0a0a', color: '#f87171', border: '1px solid #3a1a1a' }
        : { background: '#1a1500', color: '#fbbf24', border: '1px solid #3a2e00' }
  return {
    ...palette,
    fontSize: '9px',
    padding: '2px 8px',
    letterSpacing: '0.1em',
    textAlign: 'center',
  }
}

// Entry-type badge palette + copy.
function entryTypeDisplay(t: EntryType): {
  text: string
  style: React.CSSProperties
} {
  if (t === 'IDEAL') {
    return {
      text: '● IDEAL ENTRY',
      style: {
        background: '#0a1a0a',
        color: '#4ade80',
        border: '1px solid #1a3a1a',
      },
    }
  }
  if (t === 'AGGRESSIVE') {
    return {
      text: '◐ AGGRESSIVE ENTRY',
      style: {
        background: '#1a1500',
        color: '#fbbf24',
        border: '1px solid #3a2e00',
      },
    }
  }
  return {
    text: '○ WAIT FOR SETUP',
    style: {
      background: '#161616',
      color: '#b0b0b0',
      border: '1px solid #2a2a2a',
    },
  }
}

// Market-condition tag — drives the small badge next to the
// COPILOT header text.
function marketConditionDisplay(c: MarketCondition): {
  text: string
  color: string
} {
  if (c === 'TRENDING_UP') return { text: '▲ TRENDING', color: '#4ade80' }
  if (c === 'TRENDING_DOWN') return { text: '▼ TRENDING', color: '#f87171' }
  if (c === 'BREAKOUT_WATCH')
    return { text: '◎ BREAKOUT WATCH', color: '#fbbf24' }
  return { text: '◆ RANGING', color: '#b0b0b0' }
}

// R:R color tier — green ≥1:2, amber ≥1:1.5, red below.
function riskRewardColor(rr: string): string {
  // Parse the second number out of "1:X.Y" — anything we can't
  // parse falls into the bottom tier.
  const m = rr.match(/^1\s*:\s*([\d.]+)/)
  if (!m) return '#f87171'
  const ratio = parseFloat(m[1])
  if (!Number.isFinite(ratio)) return '#f87171'
  if (ratio >= 2) return '#4ade80'
  if (ratio >= 1.5) return '#fbbf24'
  return '#f87171'
}

// Confluence score color tier — green ≥6, amber ≥4, red <4.
function confluenceColor(score: number): string {
  if (score >= 6) return '#4ade80'
  if (score >= 4) return '#fbbf24'
  return '#f87171'
}

// Map a single SignalBreakdown direction to its display tone.
function signalDotColor(b: Bias): string {
  if (b === 'BULLISH') return '#4ade80'
  if (b === 'BEARISH') return '#f87171'
  return '#b0b0b0'
}
function signalShortText(b: Bias): string {
  if (b === 'BULLISH') return 'BULL'
  if (b === 'BEARISH') return 'BEAR'
  return 'NEUT'
}

// Display-friendly label for each signal key.
const SIGNAL_LABELS: Record<keyof SignalBreakdown, string> = {
  trend: 'TREND',
  momentum: 'MOMENTUM',
  macd: 'MACD',
  dxy: 'DXY',
  us10y: 'US 10Y',
  session: 'SESSION',
  news: 'NEWS',
  calendar: 'CALENDAR',
}

// Iteration order for the 8-signal grid.
const SIGNAL_ORDER: (keyof SignalBreakdown)[] = [
  'trend',
  'momentum',
  'macd',
  'dxy',
  'us10y',
  'session',
  'news',
  'calendar',
]

// Format secondsUntilNext → "MM:SS" (zero-padded).
function formatCountdown(seconds: number): string {
  const s = Math.max(0, seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// Parse the "NOW: ... RISK: ... TRIGGER: ..." catalyst format
// into three labeled lines. Falls back gracefully if the model
// deviates from the format (returns the whole catalyst as `now`).
//
// Uses [\s\S] instead of the `s` (dotAll) regex flag so we don't
// need to bump tsconfig target to ES2018 — same matching
// behavior, broader compatibility.
function parseCatalyst(catalyst: string): {
  now: string
  risk: string
  trigger: string
} {
  const nowMatch = catalyst.match(/NOW:\s*([\s\S]+?)(?=\s*RISK:|$)/)
  const riskMatch = catalyst.match(/RISK:\s*([\s\S]+?)(?=\s*TRIGGER:|$)/)
  const triggerMatch = catalyst.match(/TRIGGER:\s*([\s\S]+?)$/)
  return {
    now: nowMatch?.[1]?.trim() ?? catalyst,
    risk: riskMatch?.[1]?.trim() ?? '——',
    trigger: triggerMatch?.[1]?.trim() ?? '——',
  }
}

// Shared label tone — tiny uppercase muted labels.
const labelStyle: React.CSSProperties = {
  color: '#888888',
  fontSize: '8px',
  textTransform: 'uppercase',
}

// Reusable shimmer bar.
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

// One trade-parameter cell (entry / stop / target).
function ParamCell({
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
          <Skeleton width={55} height={11} />
        </div>
      ) : (
        <div
          style={{
            color: value ? color : '#666666',
            fontSize: '11px',
            fontWeight: 500,
            marginTop: '2px',
          }}
        >
          {value ?? '——'}
        </div>
      )}
    </div>
  )
}

// One row in the 8-signal grid.
function SignalRow({
  label,
  bias,
  loading,
}: {
  label: string
  bias: Bias | undefined
  loading: boolean
}) {
  if (loading || !bias) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ ...labelStyle, fontSize: '8px' }}>{label}</span>
        <span style={{ color: '#666666', fontSize: '8px' }}>——</span>
      </div>
    )
  }
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span style={{ ...labelStyle, fontSize: '8px' }}>{label}</span>
      <span style={{ color: signalDotColor(bias), fontSize: '8px' }}>
        ● {signalShortText(bias)}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export default function AnalysisPanel() {
  const analysis = useAnalysis()
  const goldPrice = useGoldPrice()
  const signals = useSignals()
  const news = useNews()
  const technicals = useTechnicals()
  const calendar = useCalendar()
  const { data, loading, error, secondsUntilNext, trigger } = analysis

  const [hoverBtn, setHoverBtn] = useState(false)

  // Fade-in on every fresh analysis result.
  const [fadeClass, setFadeClass] = useState('')
  useEffect(() => {
    if (!data) return
    setFadeClass('fade-in')
    const timer = setTimeout(() => setFadeClass(''), 300)
    return () => clearTimeout(timer)
  }, [data?.generatedAt])

  // Build the analyze payload from current upstream state.
  const buildRequest = useCallback((): AnalysisRequest => {
    const session = getCurrentSession()
    const articles = news.articles
    const newsBullishCount = articles.filter(
      (a) => a.sentiment === 'BULLISH'
    ).length
    const newsBearishCount = articles.filter(
      (a) => a.sentiment === 'BEARISH'
    ).length
    const newsNeutralCount =
      articles.length - newsBullishCount - newsBearishCount

    const ind = technicals.indicators

    return {
      price: goldPrice.data?.price ?? 0,
      changePct: goldPrice.data?.changePct ?? 0,
      high: goldPrice.data?.high ?? 0,
      low: goldPrice.data?.low ?? 0,
      open: goldPrice.data?.open ?? 0,
      ema20: ind?.ema20 ?? 0,
      ema50: ind?.ema50 ?? 0,
      ema200: ind?.ema200 ?? 0,
      rsi: ind?.rsi ?? 50,
      macd: ind?.macd ?? 0,
      macdSignal: ind?.macdSignal ?? 0,
      macdHistogram: ind?.macdHistogram ?? 0,
      macdCross: ind?.macdCross ?? 'NONE',
      atr: ind?.atr ?? 0,
      bbUpper: ind?.bbUpper ?? 0,
      bbLower: ind?.bbLower ?? 0,
      swingHigh: ind?.swingHigh ?? 0,
      swingLow: ind?.swingLow ?? 0,
      trend: ind?.trend ?? 'RANGING',
      rsiZone: ind?.rsiZone ?? 'NEUTRAL',
      dayRangePct: ind?.dayRangePct ?? 50,
      priceVsEma20: ind?.priceVsEma20 ?? 'ABOVE',
      priceVsEma50: ind?.priceVsEma50 ?? 'ABOVE',
      priceVsEma200: ind?.priceVsEma200 ?? 'ABOVE',
      dxy: signals.data?.dxy.price ?? 0,
      dxyChangePct: signals.data?.dxy.changePct ?? 0,
      us10y: signals.data?.us10y.price ?? 0,
      us10yChangePct: signals.data?.us10y.changePct ?? 0,
      session: session.name,
      sessionIsHighVolatility: session.isHighVolatility,
      clearToTrade: calendar.data?.clearToTrade ?? true,
      warningMessage: calendar.data?.warningMessage ?? null,
      nextEventTitle: calendar.data?.nextHighImpact?.title ?? null,
      nextEventMinutes:
        calendar.data?.nextHighImpact?.minutesUntil ?? null,
      newsBullishCount,
      newsBearishCount,
      newsNeutralCount,
      topHeadlines: articles.slice(0, 6).map((a) => a.title),
    }
  }, [
    goldPrice.data,
    signals.data,
    news.articles,
    technicals.indicators,
    calendar.data,
  ])

  // Auto-trigger ONCE on mount, as soon as the price hook has
  // its first reading. Pre-populates the Copilot card without
  // requiring a user click — useful for client previews where
  // the dashboard should look "live" the moment it loads.
  // Subsequent runs go through the manual button or R shortcut
  // (the countdown hook never reaches 0 in practice; the auto-
  // trigger effect below stays in place for symmetry).
  const hasAutoTriggered = useRef(false)
  useEffect(() => {
    if (hasAutoTriggered.current) return
    if (!goldPrice.data) return
    if (calendar.data?.clearToTrade === false) return
    hasAutoTriggered.current = true
    trigger(buildRequest())
  }, [goldPrice.data, calendar.data, trigger, buildRequest])

  // Auto-trigger when the countdown wraps.
  useEffect(() => {
    if (secondsUntilNext === 0 && goldPrice.data) {
      trigger(buildRequest())
    }
  }, [secondsUntilNext, goldPrice.data, buildRequest, trigger])

  // Keyboard shortcut bridge: page.tsx dispatches a
  // 'triggerAnalysis' CustomEvent on R/r. Listen here and fire
  // the same path the RUN ANALYSIS button takes — respecting
  // loading + calendar gate so a stale R-press during a
  // blocked window can't sneak through.
  useEffect(() => {
    function handleTrigger() {
      if (loading) return
      if (calendar.data?.clearToTrade === false) return
      if (!goldPrice.data) return
      trigger(buildRequest())
    }
    window.addEventListener('triggerAnalysis', handleTrigger)
    return () => window.removeEventListener('triggerAnalysis', handleTrigger)
  }, [loading, calendar.data, goldPrice.data, trigger, buildRequest])

  // Calendar gate — when blocked, the panel disables the analyze
  // button entirely with a clear "calendar block" message.
  const calendarBlocked =
    calendar.data?.clearToTrade === false && !loading

  const onClickRun = () => {
    if (loading || calendarBlocked) return
    trigger(buildRequest())
  }

  // Header right node — three states.
  let countdownNode: React.ReactNode
  if (loading) {
    countdownNode = (
      <span className="pulse" style={{ color: '#fbbf24', fontSize: '9px' }}>ANALYSE...</span>
    )
  } else if (data) {
    countdownNode = (
      <span style={{ color: '#666666', fontSize: '9px' }}>
        {formatCountdown(secondsUntilNext)}
      </span>
    )
  } else {
    countdownNode = (
      <span style={{ color: '#666666', fontSize: '9px' }}>——</span>
    )
  }

  const showSkeleton = loading
  const showError = !loading && !!error
  const rec = data ? recDisplay(data.recommendation) : null
  const mc = data ? marketConditionDisplay(data.marketCondition) : null
  const et = data ? entryTypeDisplay(data.entryType) : null
  const cat = data ? parseCatalyst(data.catalyst) : null

  // Calendar warning banner styling — two tiers.
  const warningCopy = calendar.data?.warningMessage ?? null
  const warningHard = calendar.data?.clearToTrade === false
  const warningStyle: React.CSSProperties | null = warningCopy
    ? warningHard
      ? {
          background: '#1a0000',
          borderBottom: '1px solid #3a0000',
          color: '#f87171',
        }
      : {
          background: '#1a0e00',
          borderBottom: '1px solid #3a2200',
          color: '#fbbf24',
        }
    : null

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
      {/* 1. Header. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px 6px 12px',
          borderBottom: '1px solid #222222',
          gap: '8px',
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span
            style={{
              color: '#888888',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >COPILOTE</span>
          {mc && (
            <span
              style={{
                color: mc.color,
                fontSize: '8px',
                letterSpacing: '0.08em',
              }}
            >
              {mc.text}
            </span>
          )}
        </div>
        {countdownNode}
      </div>

      {/* 2. Calendar warning banner — conditional. */}
      {warningCopy && warningStyle && (
        <div
          style={{
            ...warningStyle,
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '10px' }}>⚠</span>
          <span style={{ fontSize: '9px', lineHeight: 1.4 }}>
            {warningCopy}
          </span>
        </div>
      )}

      {/* 3. Recommendation block — the focal element. */}
      <div
        className={fadeClass}
        style={{
          padding: '12px 12px 10px 12px',
          borderBottom: '1px solid #222222',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Left: large recommendation glyph + word. */}
          {showSkeleton ? (
            <Skeleton width={140} height={28} />
          ) : showError ? (
            <span
              style={{ color: '#666666', fontSize: '28px', fontWeight: 500 }}
            >
              ——
            </span>
          ) : rec ? (
            <span
              style={{
                color: rec.color,
                fontSize: '28px',
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
            >
              {rec.glyph} {rec.text}
            </span>
          ) : (
            <span
              style={{ color: '#666666', fontSize: '28px', fontWeight: 500 }}
            >
              ——
            </span>
          )}

          {/* Right: bias badge stack + confidence. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {showSkeleton ? (
              <Skeleton width={80} height={14} />
            ) : data && !showError ? (
              <span style={biasBadgeStyle(data.bias)}>{data.bias}</span>
            ) : (
              <span style={{ color: '#666666', fontSize: '9px' }}>——</span>
            )}
            {data && !showError && (
              <span
                style={{
                  color: '#888888',
                  fontSize: '8px',
                  textAlign: 'right',
                  letterSpacing: '0.08em',
                }}
              >
                <span style={{ color: confidenceColor(data.confidence) }}>
                  {data.confidence}
                </span>{' '}
                CONFIANCE
              </span>
            )}
          </div>
        </div>

        {/* entryTiming + entryType badge on a second line. */}
        {(showSkeleton || (data && !showError)) && (
          <div style={{ marginTop: '8px' }}>
            {showSkeleton ? (
              <Skeleton widthPct="80%" height={9} />
            ) : data ? (
              <>
                <div
                  style={{ color: '#999999', fontSize: '9px', lineHeight: 1.5 }}
                >
                  {data.entryTiming}
                </div>
                {et && (
                  <span
                    style={{
                      ...et.style,
                      display: 'inline-block',
                      fontSize: '9px',
                      padding: '3px 8px',
                      letterSpacing: '0.08em',
                      marginTop: '6px',
                    }}
                  >
                    {et.text}
                  </span>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* 4. Trade parameters — entry/stop/target grid + R:R/HOLD + INVALIDATION. */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #222222',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
          }}
        >
          <ParamCell
            label="ENTRÉE"
            value={showError ? undefined : data?.entry}
            color="#60a5fa"
            loading={showSkeleton}
          />
          <ParamCell
            label="STOP"
            value={showError ? undefined : data?.stop}
            color="#f87171"
            loading={showSkeleton}
          />
          <ParamCell
            label="OBJECTIF"
            value={showError ? undefined : data?.target}
            color="#4ade80"
            loading={showSkeleton}
          />
        </div>

        {/* R:R + HOLD */}
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={labelStyle}>R/R</span>{' '}
            {showSkeleton ? (
              <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                <Skeleton width={40} height={11} />
              </span>
            ) : (
              <span
                style={{
                  color:
                    showError || !data
                      ? '#666666'
                      : riskRewardColor(data.riskReward),
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {showError || !data ? '——' : data.riskReward}
              </span>
            )}
          </div>
          <div>
            <span style={labelStyle}>DURÉE</span>{' '}
            {showSkeleton ? (
              <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                <Skeleton width={50} height={11} />
              </span>
            ) : (
              <span
                style={{
                  color: showError || !data ? '#666666' : '#b0b0b0',
                  fontSize: '11px',
                }}
              >
                {showError || !data ? '——' : data.holdTime}
              </span>
            )}
          </div>
        </div>

        {/* INVALIDATION row — full width. */}
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={labelStyle}>INVALIDATION</span>
          {showSkeleton ? (
            <Skeleton width={70} height={10} />
          ) : (
            <span
              style={{
                color: showError || !data ? '#666666' : '#b0b0b0',
                fontSize: '10px',
              }}
            >
              {showError || !data ? '——' : data.invalidationLevel}
            </span>
          )}
        </div>
      </div>

      {/* 5. Confluence score block. */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #222222',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              color: '#888888',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >CONFLUENCE</span>
          {showSkeleton ? (
            <Skeleton width={40} height={12} />
          ) : data && !showError ? (
            <span
              style={{
                color: confluenceColor(data.confluenceScore),
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {data.confluenceScore}/{data.confluenceTotal}
            </span>
          ) : (
            <span style={{ color: '#666666', fontSize: '12px' }}>——</span>
          )}
        </div>

        {/* 8-block score bar. */}
        <div style={{ display: 'flex', gap: '3px' }}>
          {Array.from({ length: 8 }).map((_, i) => {
            // Filled if i < confluenceScore. Color by bias.
            const filled =
              !showSkeleton && !showError && data
                ? i < data.confluenceScore
                : false
            const filledColor = data
              ? data.bias === 'BULLISH'
                ? '#4ade80'
                : data.bias === 'BEARISH'
                  ? '#f87171'
                  : '#fbbf24'
              : '#1e1e1e'
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: '4px',
                  borderRadius: '1px',
                  background: filled ? filledColor : '#1e1e1e',
                  border: filled ? 'none' : '1px solid #2a2a2a',
                }}
              />
            )
          })}
        </div>

        {/* 8-signal breakdown grid. */}
        <div
          style={{
            marginTop: '8px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
          }}
        >
          {SIGNAL_ORDER.map((key) => (
            <SignalRow
              key={key}
              label={SIGNAL_LABELS[key]}
              bias={showError ? undefined : data?.signals[key]}
              loading={showSkeleton}
            />
          ))}
        </div>
      </div>

      {/* 6. Catalyst block — NOW / RISK / TRIGGER + exitPlan. */}
      <div
        style={{ padding: '8px 12px', borderBottom: '1px solid #222222' }}
      >
        {showSkeleton ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton widthPct="90%" height={8} />
            <Skeleton widthPct="75%" height={8} />
            <Skeleton widthPct="60%" height={8} />
          </div>
        ) : showError ? (
          <>
            <div style={{ color: '#f87171', fontSize: '10px' }}>ÉCHEC ANALYSE</div>
            <div
              style={{ color: '#888888', fontSize: '9px', marginTop: '4px' }}
            >Vérifier la clé API et réessayer.</div>
          </>
        ) : data && cat ? (
          <>
            {/* NOW */}
            <div style={{ marginBottom: '4px' }}>
              <span style={{ ...labelStyle, marginRight: '4px' }}>MAINT.</span>
              <span
                style={{ color: '#999999', fontSize: '9px', lineHeight: 1.5 }}
              >
                {cat.now}
              </span>
            </div>
            {/* RISK */}
            <div style={{ marginBottom: '4px' }}>
              <span
                style={{
                  ...labelStyle,
                  color: '#f87171',
                  marginRight: '4px',
                }}
              >RISQUE</span>
              <span
                style={{ color: '#999999', fontSize: '9px', lineHeight: 1.5 }}
              >
                {cat.risk}
              </span>
            </div>
            {/* TRIGGER */}
            <div>
              <span
                style={{
                  ...labelStyle,
                  color: '#4ade80',
                  marginRight: '4px',
                }}
              >
                DÉCLENCH.
              </span>
              <span
                style={{
                  color: '#b0b0b0',
                  fontSize: '9px',
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                }}
              >
                {cat.trigger}
              </span>
            </div>
            {/* exitPlan */}
            <div
              style={{
                marginTop: '6px',
                color: '#555555',
                fontSize: '9px',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              <span style={{ ...labelStyle, marginRight: '4px' }}>SORTIE</span>
              {data.exitPlan}
            </div>
          </>
        ) : (
          <div style={{ color: '#666666', fontSize: '9px' }}>Lancer une analyse pour générer une thèse de trade.</div>
        )}
      </div>

      {/* 7. Action button — primary CTA for the dashboard.
            Four states:
              idle             → white bg + black text (CTA pop)
              hover (idle)     → very-light-grey bg, same darker text
              loading          → muted grey bg + dim text, disabled
              calendar-blocked → amber-tinted dark bg + amber text,
                                 disabled
            Outline-style was muted enough to read as secondary;
            now this is unmistakably the action the trader is
            meant to take. */}
      <button
        className="terminal-btn"
        onClick={onClickRun}
        disabled={loading || calendarBlocked}
        onMouseEnter={() => setHoverBtn(true)}
        onMouseLeave={() => setHoverBtn(false)}
        style={{
          margin: '12px',
          width: 'calc(100% - 24px)',
          height: '36px',
          background: loading
            ? '#1a1a1a'
            : calendarBlocked
              ? '#1a0e00'
              : hoverBtn
                ? '#e5e5e5'
                : '#f5f5f5',
          border: `1px solid ${
            loading
              ? '#222222'
              : calendarBlocked
                ? '#3a2200'
                : hoverBtn
                  ? '#cccccc'
                  : '#f5f5f5'
          }`,
          color: loading
            ? '#666666'
            : calendarBlocked
              ? '#fbbf24'
              : '#0a0a0a',
          fontFamily: 'var(--font-sans)',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.12em',
          cursor: loading || calendarBlocked ? 'not-allowed' : 'pointer',
          borderRadius: '2px',
        }}
      >
        {loading
          ? 'ANALYSE EN COURS...'
          : calendarBlocked
            ? '⚠ CALENDRIER BLOQUÉ — ANALYSE DÉSACTIVÉE'
            : showError
              ? 'RÉESSAYER'
              : "LANCER L'ANALYSE"}
      </button>

      {/* 8. Footer — last analysis time + technicals last update. */}
      <div
        style={{
          padding: '0 12px 8px 12px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        {data && !showError ? (
          <span style={{ color: '#666666', fontSize: '8px' }}>
            LAST: {formatDateTime(data.generatedAt)}
          </span>
        ) : (
          <span />
        )}
        {technicals.lastUpdated ? (
          <span style={{ color: '#666666', fontSize: '8px' }}>
            TA:{' '}
            {technicals.lastUpdated.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </span>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
