// SignalsPanel — global horizontal strip below PriceBar.
//
// Two rows of compact chips inside one panel:
//
//   MACRO     — DXY, US 10Y, SPREAD, SESSION VOL
//   TECHNICAL — RSI 14, MACD, TREND, EMA 20/50, ATR 14, BB BAND, DAY RANGE
//
// Each chip is a stacked label + value (+ optional badge / mini bar)
// at ~70-100px wide. The whole strip sits at a fixed ~78px height
// across the full viewport width — always visible (= "global"),
// never competes with the chart for vertical space.
//
// Inverse-correlation tint on DXY / US10Y values (rising dollar /
// yields = bearish for gold = red). Per-row independent skeleton
// branches so MACRO and TECHNICAL can land at different times.
//
// Skeleton + pulse keyframes live in app/globals.css.

'use client'

import { useEffect, useRef, useState } from 'react'
import { useSignals } from '@/lib/hooks/useSignals'
import { useTechnicals } from '@/lib/hooks/useTechnicals'
import { getCurrentSession } from '@/lib/session'
import { formatPct, changeColor } from '@/lib/utils'
import Tooltip from '@/components/Tooltip'

// ─────────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────────

function inverseValueColor(change: number): string {
  if (change > 0) return '#f87171'
  if (change < 0) return '#4ade80'
  return '#e5e5e5'
}

function atrContext(atr: number): { text: string; color: string } {
  if (atr > 25) return { text: 'HIGH VOL', color: '#f87171' }
  if (atr > 15) return { text: 'NORMAL', color: '#888888' }
  return { text: 'LOW VOL', color: '#4ade80' }
}

function dayRangeFillColor(pct: number): string {
  if (pct > 70) return '#f87171'
  if (pct < 30) return '#4ade80'
  return '#888888'
}

// Flash hook — mirrors PriceBar's price-flash. Returns the
// current flash class for the watched value (briefly green/red,
// then cleared).
function usePriceFlash(value: number | undefined): string {
  const prevRef = useRef<number | null>(null)
  const [flashClass, setFlashClass] = useState('')
  useEffect(() => {
    if (value === undefined || value === null) return
    if (prevRef.current === null) {
      prevRef.current = value
      return
    }
    if (value > prevRef.current) {
      setFlashClass('flash-green')
    } else if (value < prevRef.current) {
      setFlashClass('flash-red')
    }
    prevRef.current = value
    const timer = setTimeout(() => setFlashClass(''), 600)
    return () => clearTimeout(timer)
  }, [value])
  return flashClass
}

const PLACEHOLDER = '——'

// Shared chip layout — stacked label on top, value(s) below.
const chipStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  flexShrink: 0,
  minWidth: '72px',
}

const chipLabelStyle: React.CSSProperties = {
  color: '#444444',
  fontSize: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
}

// Value cell shared shape — a flex row so the main number and an
// optional suffix badge sit on the same baseline.
const chipValueRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'baseline',
  gap: '4px',
  whiteSpace: 'nowrap',
}

// Each row's left-side section label ("MACRO" / "TECHNICAL").
// Fixed width so the chips line up vertically across both rows.
const sectionLabelStyle: React.CSSProperties = {
  color: '#333333',
  fontSize: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  width: '64px',
  flexShrink: 0,
}

// Single shimmer bar — drop-in skeleton for any chip.
function Shim({ width, height }: { width: string; height: number }) {
  return (
    <div
      className="shimmer"
      style={{
        width,
        height: `${height}px`,
        background: '#1a1a1a',
        borderRadius: '2px',
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export default function SignalsPanel() {
  const { data, loading, error } = useSignals()
  const technicals = useTechnicals()
  const session = getCurrentSession()

  const dxy = data?.dxy
  const us10y = data?.us10y
  const ind = technicals.indicators

  // Flash classes for the DXY and US10Y value cells.
  const dxyFlash = usePriceFlash(dxy?.price)
  const us10yFlash = usePriceFlash(us10y?.price)

  // Per-section skeleton flags so MACRO and TECHNICAL can be in
  // different states (e.g. macro fetched but technicals still
  // loading).
  const showMacroSkeleton = !data && loading && !error
  const showTechSkeleton =
    !ind && technicals.loading && !technicals.error

  // Last-update marker on the right of the TECHNICAL row.
  const upd = technicals.lastUpdated
    ? `UPD ${technicals.lastUpdated.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })}`
    : data
      ? `UPD ${new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}`
      : error || technicals.error
        ? PLACEHOLDER
        : 'UPDATING...'

  return (
    <div
      style={{
        background: '#111111',
        borderTop: '1px solid #222222',
        borderBottom: '1px solid #222222',
        padding: '6px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {/* Optional error banners — rendered inline above the rows
          they affect, kept tiny so they don't push the strip
          height around. */}
      {(error || technicals.error) && (
        <div style={{ color: '#f87171', fontSize: '8px' }}>
          {error ? 'SIGNAL ERROR' : 'TECHNICALS ERROR'}
        </div>
      )}

      {/* ── ROW 1 — MACRO ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <span style={sectionLabelStyle}>MACRO</span>

        {/* DXY */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="US Dollar Index — measures USD strength vs 6 major currencies. Gold and DXY are inversely correlated. DXY falling = bullish for gold; DXY rising = bearish."
          >
            <span style={chipLabelStyle}>DXY</span>
          </Tooltip>
          {showMacroSkeleton ? (
            <Shim width="80px" height={11} />
          ) : (
            <div style={chipValueRow}>
              <span
                className={dxyFlash}
                style={{
                  color: dxy ? inverseValueColor(dxy.change) : '#333333',
                  fontSize: '11px',
                  padding: '1px 3px',
                }}
              >
                {dxy ? dxy.price.toFixed(2) : PLACEHOLDER}
              </span>
              <span
                style={{
                  color: dxy ? changeColor(dxy.change) : '#333333',
                  fontSize: '9px',
                }}
              >
                {dxy ? formatPct(dxy.changePct) : ''}
              </span>
            </div>
          )}
        </div>

        {/* US 10Y */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="US 10-Year Treasury yield. Gold pays no interest, so rising yields make bonds more attractive vs gold. Yield rising = bearish for gold."
          >
            <span style={chipLabelStyle}>US 10Y</span>
          </Tooltip>
          {showMacroSkeleton ? (
            <Shim width="80px" height={11} />
          ) : (
            <div style={chipValueRow}>
              <span
                className={us10yFlash}
                style={{
                  color: us10y ? inverseValueColor(us10y.change) : '#333333',
                  fontSize: '11px',
                  padding: '1px 3px',
                }}
              >
                {us10y ? `${us10y.price.toFixed(2)}%` : PLACEHOLDER}
              </span>
              <span
                style={{
                  color: us10y ? changeColor(us10y.change) : '#333333',
                  fontSize: '9px',
                }}
              >
                {us10y ? formatPct(us10y.changePct) : ''}
              </span>
            </div>
          )}
        </div>

        {/* SPREAD (static for now) */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="Bid-ask spread in dollars — the cost to enter and exit a gold trade. Lower is better. Widens during low liquidity."
          >
            <span style={chipLabelStyle}>SPREAD</span>
          </Tooltip>
          <span style={{ color: '#e5e5e5', fontSize: '11px' }}>0.35</span>
        </div>

        {/* SESSION VOL */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="Expected volume for current session. HIGH during NY/London overlap (12-16 UTC) when both markets are active."
          >
            <span style={chipLabelStyle}>SESSION VOL</span>
          </Tooltip>
          <span
            style={{
              color: session.isHighVolatility ? '#fbbf24' : '#888888',
              fontSize: '11px',
            }}
          >
            {session.isHighVolatility ? 'HIGH' : 'NORMAL'}
          </span>
        </div>
      </div>

      {/* ── ROW 2 — TECHNICAL ─────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <span style={sectionLabelStyle}>TECHNICAL</span>

        {/* RSI 14 */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="Relative Strength Index (14). ≥70 = OVERBOUGHT (potential reversal down). ≤30 = OVERSOLD (potential reversal up). 40-60 = neutral."
          >
            <span style={chipLabelStyle}>RSI 14</span>
          </Tooltip>
          {showTechSkeleton ? (
            <Shim width="60px" height={11} />
          ) : ind ? (
            <div style={chipValueRow}>
              <span
                style={{
                  color:
                    ind.rsiZone === 'OVERBOUGHT'
                      ? '#f87171'
                      : ind.rsiZone === 'OVERSOLD'
                        ? '#4ade80'
                        : '#e5e5e5',
                  fontSize: '11px',
                }}
              >
                {ind.rsi.toFixed(1)}
              </span>
              {ind.rsiZone === 'OVERBOUGHT' && (
                <span style={{ color: '#f87171', fontSize: '8px' }}>OB</span>
              )}
              {ind.rsiZone === 'OVERSOLD' && (
                <span style={{ color: '#4ade80', fontSize: '8px' }}>OS</span>
              )}
            </div>
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>

        {/* MACD */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="MACD histogram = MACD line minus signal line. Positive growing = bullish momentum. Negative growing = bearish. A fresh cross is a strong gold day-trade entry signal."
          >
            <span style={chipLabelStyle}>MACD</span>
          </Tooltip>
          {showTechSkeleton ? (
            <Shim width="70px" height={11} />
          ) : ind ? (
            <div style={chipValueRow}>
              <span
                style={{
                  color:
                    ind.macdHistogram > 0
                      ? '#4ade80'
                      : ind.macdHistogram < 0
                        ? '#f87171'
                        : '#888888',
                  fontSize: '11px',
                }}
              >
                {ind.macdHistogram.toFixed(3)}
              </span>
              {ind.macdCross === 'BULLISH_CROSS' && (
                <span style={{ color: '#4ade80', fontSize: '8px' }}>
                  ✕ BULL
                </span>
              )}
              {ind.macdCross === 'BEARISH_CROSS' && (
                <span style={{ color: '#f87171', fontSize: '8px' }}>
                  ✕ BEAR
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>

        {/* TREND */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="Overall 1H trend from EMA20 vs EMA50 alignment + price position. UPTREND: price + EMA20 above EMA50. DOWNTREND: mirror. RANGING: mixed. Trade WITH the trend."
          >
            <span style={chipLabelStyle}>TREND</span>
          </Tooltip>
          {showTechSkeleton ? (
            <Shim width="70px" height={11} />
          ) : ind ? (
            <span
              style={{
                color:
                  ind.trend === 'UPTREND'
                    ? '#4ade80'
                    : ind.trend === 'DOWNTREND'
                      ? '#f87171'
                      : '#888888',
                fontSize: '11px',
              }}
            >
              {ind.trend}
            </span>
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>

        {/* EMA 20/50 */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="Short-term (20h) and medium-term (50h) Exponential Moving Averages. Price above both = bullish structure. EMA20 crossing EMA50 = trend change."
          >
            <span style={chipLabelStyle}>EMA 20/50</span>
          </Tooltip>
          {showTechSkeleton ? (
            <Shim width="60px" height={11} />
          ) : ind ? (
            <div style={chipValueRow}>
              <span
                style={{
                  color:
                    ind.priceVsEma20 === 'ABOVE' ? '#4ade80' : '#f87171',
                  fontSize: '10px',
                }}
              >
                20{ind.priceVsEma20 === 'ABOVE' ? '▲' : '▼'}
              </span>
              <span
                style={{
                  color:
                    ind.priceVsEma50 === 'ABOVE' ? '#4ade80' : '#f87171',
                  fontSize: '10px',
                }}
              >
                50{ind.priceVsEma50 === 'ABOVE' ? '▲' : '▼'}
              </span>
            </div>
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>

        {/* ATR 14 */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="Average True Range (14) — current volatility in dollars. Use to size stops: stop = entry ± 1-1.5 × ATR. Higher ATR = wider stops + bigger moves."
          >
            <span style={chipLabelStyle}>ATR 14</span>
          </Tooltip>
          {showTechSkeleton ? (
            <Shim width="80px" height={11} />
          ) : ind ? (
            (() => {
              const ctx = atrContext(ind.atr)
              return (
                <div style={chipValueRow}>
                  <span style={{ color: '#888888', fontSize: '11px' }}>
                    ${ind.atr.toFixed(2)}
                  </span>
                  <span style={{ color: ctx.color, fontSize: '8px' }}>
                    {ctx.text}
                  </span>
                </div>
              )
            })()
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>

        {/* BB BAND */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="Bollinger Bands (20, 2σ). Above upper = overextended. Below lower = oversold. Inside = normal range. Squeeze = volatility breakout coming."
          >
            <span style={chipLabelStyle}>BB BAND</span>
          </Tooltip>
          {showTechSkeleton ? (
            <Shim width="70px" height={11} />
          ) : ind ? (
            (() => {
              const ref = ind.ema20
              if (ref === 0)
                return (
                  <span style={{ color: '#888888', fontSize: '10px' }}>
                    INSIDE
                  </span>
                )
              if (ref > ind.bbUpper)
                return (
                  <span style={{ color: '#f87171', fontSize: '10px' }}>
                    ABOVE UP
                  </span>
                )
              if (ref < ind.bbLower)
                return (
                  <span style={{ color: '#4ade80', fontSize: '10px' }}>
                    BELOW LOW
                  </span>
                )
              return (
                <span style={{ color: '#888888', fontSize: '10px' }}>
                  INSIDE
                </span>
              )
            })()
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>

        {/* DAY RANGE — chip with mini bar inline. */}
        <div style={chipStyle}>
          <Tooltip
            position="bottom"
            content="Where current price sits within today's high-low range. 0% = at low, 100% = at high. >70% extended (risky for new longs). <30% = room to run."
          >
            <span style={chipLabelStyle}>DAY RANGE</span>
          </Tooltip>
          {showTechSkeleton ? (
            <Shim width="60px" height={11} />
          ) : ind ? (
            <div style={chipValueRow}>
              <span
                style={{
                  color: dayRangeFillColor(ind.dayRangePct),
                  fontSize: '11px',
                }}
              >
                {ind.dayRangePct.toFixed(0)}%
              </span>
              {/* Tiny inline progress bar so the trader sees position
                  visually, not just numerically. */}
              <div
                style={{
                  width: '36px',
                  height: '3px',
                  background: '#1e1e1e',
                  borderRadius: '1px',
                  overflow: 'hidden',
                  marginLeft: '2px',
                }}
              >
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, ind.dayRangePct))}%`,
                    height: '100%',
                    background: dayRangeFillColor(ind.dayRangePct),
                  }}
                />
              </div>
            </div>
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>

        {/* UPD marker — pinned to the far right of the strip via
            marginLeft:auto. */}
        <div
          style={{
            ...chipStyle,
            marginLeft: 'auto',
            alignItems: 'flex-end',
          }}
        >
          <span style={chipLabelStyle}>STATUS</span>
          <span style={{ color: '#333333', fontSize: '9px' }}>{upd}</span>
        </div>
      </div>
    </div>
  )
}
