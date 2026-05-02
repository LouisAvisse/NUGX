// SignalsPanel — global single-row strip below PriceBar.
//
// One horizontal row containing two sections separated by
// vertical dividers:
//
//   [MACRO]  DXY · US 10Y · SPREAD · VOL    │    [TECHNIQUE]  RSI · MACD · TENDANCE · EMA · ATR · BB · AMP   │   UPD HH:MM
//
// Each chip is INLINE (label + value side-by-side, not stacked)
// so 11 chips + 2 section pills + 2 dividers + the STATUS marker
// all fit on a single line on viewports ≥ 1280px. flexWrap is
// enabled as a fallback so narrower viewports reflow cleanly to
// a second row instead of clipping.
//
// Section "pills" use a small dark-bg + bright-fg + letter-
// spacing treatment that reads as a section header without
// shouting.
//
// Inverse-correlation tint on DXY / US 10Y values (rising
// dollar / yields = bearish for gold = red).

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

// [F-08] DXY / US10Y values were previously tinted with inverse
// logic — rising = red, falling = green — to encode "bearish for
// gold". The audit (and screenshot review) flagged this as
// confusing: traders parse "absolute level red" as "value fell",
// which is the opposite of what the inverse logic implies. The
// inverse semantics are still captured in the 8-signal grid in
// the COPILOT card (where they belong as discrete bull/bear
// votes); the SignalsPanel value cell now stays neutral white,
// and the change-percent next to it carries the conventional
// up=green / down=red color via changeColor (already in use at
// the changePct site).
const NEUTRAL_VALUE_COLOR = '#e5e5e5'

// [F-10] Four-tier classification for the VOL chip. The previous
// binary (ÉLEVÉE / NORMALE) read NORMALE during off-hours, which
// understates the absent volume. Tied to session name so it
// updates implicitly with getCurrentSession().
type SessionLike = { name: string; isHighVolatility: boolean }
function volForSession(session: SessionLike): {
  text: string
  color: string
} {
  if (session.isHighVolatility) {
    return { text: 'ÉLEVÉE', color: '#fbbf24' }
  }
  if (session.name === 'Off-hours') {
    return { text: 'MORTE', color: '#f87171' }
  }
  if (session.name === 'Tokyo') {
    return { text: 'BASSE', color: '#888888' }
  }
  // London / New York standalone: standard volume.
  return { text: 'NORMALE', color: '#b0b0b0' }
}

function atrContext(atr: number): { text: string; color: string } {
  if (atr > 25) return { text: 'VOL HAUTE', color: '#f87171' }
  if (atr > 15) return { text: 'NORMAL', color: '#b0b0b0' }
  return { text: 'VOL BASSE', color: '#4ade80' }
}

function dayRangeFillColor(pct: number): string {
  if (pct > 70) return '#f87171'
  if (pct < 30) return '#4ade80'
  return '#b0b0b0'
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

// Inline chip layout: label + value (+ optional sub) on one line.
// Each chip is a flex row so all three children share a baseline.
const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'row',
  alignItems: 'baseline',
  gap: '5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const chipLabelStyle: React.CSSProperties = {
  color: '#999999',
  fontSize: '9px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  fontWeight: 500,
}

// Section pill — wraps the section name (MACRO / TECHNIQUE) in a
// small dark tag that stands out from the surrounding chips.
// Lives at the very start of each section.
const sectionPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: '#1a1a1a',
  border: '1px solid #2a2a2a',
  color: '#e5e5e5',
  fontSize: '9px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.16em',
  padding: '3px 9px',
  borderRadius: '2px',
  flexShrink: 0,
}

// Vertical divider between sections — slightly more substantial
// than a chip-internal separator so the section break reads at a
// glance.
function SectionDivider() {
  return (
    <div
      style={{
        width: '1px',
        height: '18px',
        background: '#2a2a2a',
        flexShrink: 0,
      }}
    />
  )
}

// Single shimmer bar — drop-in skeleton for any chip value.
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

  // Flash classes for the DXY and US 10Y value cells.
  const dxyFlash = usePriceFlash(dxy?.price)
  const us10yFlash = usePriceFlash(us10y?.price)

  // Per-section skeleton flags so MACRO and TECHNIQUE can be in
  // different states (e.g. macro fetched but technicals still
  // loading).
  const showMacroSkeleton = !data && loading && !error
  const showTechSkeleton =
    !ind && technicals.loading && !technicals.error

  // Last-update marker on the right of the strip.
  const upd = technicals.lastUpdated
    ? `MAJ ${technicals.lastUpdated.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })}`
    : data
      ? `MAJ ${new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}`
      : error || technicals.error
        ? PLACEHOLDER
        : 'MISE À JOUR...'

  return (
    <div
      data-section="signals-strip"
      style={{
        background: '#111111',
        borderTop: '1px solid #222222',
        borderBottom: '1px solid #222222',
        padding: '10px 20px',
        // Single horizontal row, NEVER wraps. On viewports too
        // narrow to fit all chips, the strip scrolls horizontally
        // — feels native on touch (iOS / Android / iPad) thanks
        // to -webkit-overflow-scrolling:touch, and never collapses
        // to multiple stacked rows that would lose the
        // glance-able-at-a-time property of a status bar.
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: '18px',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        // Slim scrollbar so the strip's vertical real estate
        // doesn't change when the bar appears/disappears.
        scrollbarWidth: 'thin',
      }}
    >
      {/* Optional error banner — kept tiny and pushed to its own
          line via flexBasis so it doesn't disrupt chip layout. */}
      {(error || technicals.error) && (
        <div
          style={{
            color: '#f87171',
            fontSize: '9px',
            flexBasis: '100%',
            order: -1,
          }}
        >
          {error ? 'ERREUR SIGNAL' : 'ERREUR TECHNIQUE'}
        </div>
      )}

      {/* ── MACRO section ───────────────────────────────────── */}
      <span style={sectionPillStyle}>MACRO</span>

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
          <>
            <span
              className={dxyFlash}
              style={{
                // [F-08] Neutral white — directional read lives on
                // the changePct chip via changeColor.
                color: dxy ? NEUTRAL_VALUE_COLOR : '#666666',
                fontSize: '11px',
                fontWeight: 500,
                padding: '1px 3px',
              }}
            >
              {dxy ? dxy.price.toFixed(2) : PLACEHOLDER}
            </span>
            {dxy && (
              <span
                style={{ color: changeColor(dxy.change), fontSize: '9px' }}
              >
                {formatPct(dxy.changePct)}
              </span>
            )}
          </>
        )}
      </div>

      {/* US 10Y */}
      <div style={chipStyle}>
        <Tooltip
          position="bottom"
          content="US 10-Year Treasury yield. Rising yields make bonds more attractive vs gold. Yield up = bearish for gold; yield down = bullish."
        >
          <span style={chipLabelStyle}>US 10Y</span>
        </Tooltip>
        {showMacroSkeleton ? (
          <Shim width="80px" height={11} />
        ) : (
          <>
            <span
              className={us10yFlash}
              style={{
                // [F-08] Neutral white — same rationale as DXY.
                color: us10y ? NEUTRAL_VALUE_COLOR : '#666666',
                fontSize: '11px',
                fontWeight: 500,
                padding: '1px 3px',
              }}
            >
              {us10y ? `${us10y.price.toFixed(2)}%` : PLACEHOLDER}
            </span>
            {us10y && (
              <span
                style={{ color: changeColor(us10y.change), fontSize: '9px' }}
              >
                {formatPct(us10y.changePct)}
              </span>
            )}
          </>
        )}
      </div>

      {/* SPREAD (static) */}
      <div style={chipStyle}>
        <Tooltip
          position="bottom"
          content="Bid-ask spread in dollars — the cost to enter and exit a gold trade. Lower is better."
        >
          <span style={chipLabelStyle}>SPREAD</span>
        </Tooltip>
        <span
          style={{ color: '#e5e5e5', fontSize: '11px', fontWeight: 500 }}
        >
          0.35
        </span>
      </div>

      {/* SESSION VOL — [F-10] four-tier classification.
            ÉLEVÉE = NY/London overlap (peak)
            NORMALE = London or New York standalone
            BASSE   = Tokyo (low-volume Asia)
            MORTE   = Off-hours (Friday close → Sunday open) */}
      <div style={chipStyle}>
        <Tooltip
          position="bottom"
          content="Volume attendu sur la session courante. ÉLEVÉE pendant l'overlap NY/Londres (12-16 UTC) ; NORMALE en sessions Londres ou NY seules ; BASSE en Tokyo ; MORTE hors-session (week-end / nuit)."
        >
          <span style={chipLabelStyle}>VOL</span>
        </Tooltip>
        {(() => {
          const vol = volForSession(session)
          return (
            <span
              style={{ color: vol.color, fontSize: '11px', fontWeight: 500 }}
            >
              {vol.text}
            </span>
          )
        })()}
      </div>

      <SectionDivider />

      {/* ── TECHNIQUE section ──────────────────────────────── */}
      <span style={sectionPillStyle}>TECHNIQUE</span>

      {/* RSI 14 */}
      <div style={chipStyle}>
        <Tooltip
          position="bottom"
          content="Relative Strength Index (14). ≥70 = OVERBOUGHT (potential reversal down). ≤30 = OVERSOLD (potential reversal up). 40-60 = neutral."
        >
          <span style={chipLabelStyle}>RSI</span>
        </Tooltip>
        {showTechSkeleton ? (
          <Shim width="50px" height={11} />
        ) : ind ? (
          <>
            <span
              style={{
                color:
                  ind.rsiZone === 'OVERBOUGHT'
                    ? '#f87171'
                    : ind.rsiZone === 'OVERSOLD'
                      ? '#4ade80'
                      : '#e5e5e5',
                fontSize: '11px',
                fontWeight: 500,
              }}
            >
              {ind.rsi.toFixed(1)}
            </span>
            {ind.rsiZone === 'OVERBOUGHT' && (
              <span style={{ color: '#f87171', fontSize: '8px' }}>SUR</span>
            )}
            {ind.rsiZone === 'OVERSOLD' && (
              <span style={{ color: '#4ade80', fontSize: '8px' }}>SUS</span>
            )}
          </>
        ) : (
          <span style={{ color: '#666666', fontSize: '11px' }}>
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
          <Shim width="60px" height={11} />
        ) : ind ? (
          <>
            <span
              style={{
                color:
                  ind.macdHistogram > 0
                    ? '#4ade80'
                    : ind.macdHistogram < 0
                      ? '#f87171'
                      : '#b0b0b0',
                fontSize: '11px',
                fontWeight: 500,
              }}
            >
              {ind.macdHistogram >= 0 ? '+' : ''}
              {ind.macdHistogram.toFixed(2)}
            </span>
            {ind.macdCross === 'BULLISH_CROSS' && (
              <span style={{ color: '#4ade80', fontSize: '8px' }}>✕HAUSSE</span>
            )}
            {ind.macdCross === 'BEARISH_CROSS' && (
              <span style={{ color: '#f87171', fontSize: '8px' }}>✕BAISSE</span>
            )}
          </>
        ) : (
          <span style={{ color: '#666666', fontSize: '11px' }}>
            {PLACEHOLDER}
          </span>
        )}
      </div>

      {/* TENDANCE */}
      <div style={chipStyle}>
        <Tooltip
          position="bottom"
          content="Overall 1H trend from EMA20 vs EMA50 alignment + price position. Trade WITH the trend for best results."
        >
          <span style={chipLabelStyle}>TEND.</span>
        </Tooltip>
        {showTechSkeleton ? (
          <Shim width="60px" height={11} />
        ) : ind ? (
          <span
            style={{
              color:
                ind.trend === 'UPTREND'
                  ? '#4ade80'
                  : ind.trend === 'DOWNTREND'
                    ? '#f87171'
                    : '#b0b0b0',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            {ind.trend === 'UPTREND'
              ? 'HAUSSE'
              : ind.trend === 'DOWNTREND'
                ? 'BAISSE'
                : 'RANGE'}
          </span>
        ) : (
          <span style={{ color: '#666666', fontSize: '11px' }}>
            {PLACEHOLDER}
          </span>
        )}
      </div>

      {/* EMA stack */}
      <div style={chipStyle}>
        <Tooltip
          position="bottom"
          content="Exponential Moving Averages 20h / 50h. Price above both = bullish structure. EMA20 crossing EMA50 = trend change signal."
        >
          <span style={chipLabelStyle}>EMA</span>
        </Tooltip>
        {showTechSkeleton ? (
          <Shim width="50px" height={11} />
        ) : ind ? (
          <>
            <span
              style={{
                color: ind.priceVsEma20 === 'ABOVE' ? '#4ade80' : '#f87171',
                fontSize: '10px',
                fontWeight: 500,
              }}
            >
              20{ind.priceVsEma20 === 'ABOVE' ? '▲' : '▼'}
            </span>
            <span
              style={{
                color: ind.priceVsEma50 === 'ABOVE' ? '#4ade80' : '#f87171',
                fontSize: '10px',
                fontWeight: 500,
              }}
            >
              50{ind.priceVsEma50 === 'ABOVE' ? '▲' : '▼'}
            </span>
          </>
        ) : (
          <span style={{ color: '#666666', fontSize: '11px' }}>
            {PLACEHOLDER}
          </span>
        )}
      </div>

      {/* ATR 14 */}
      <div style={chipStyle}>
        <Tooltip
          position="bottom"
          content="Average True Range (14) — current volatility in dollars. Use to size stops: stop = entry ± 1-1.5 × ATR."
        >
          <span style={chipLabelStyle}>ATR</span>
        </Tooltip>
        {showTechSkeleton ? (
          <Shim width="60px" height={11} />
        ) : ind ? (
          (() => {
            const ctx = atrContext(ind.atr)
            return (
              <>
                <span
                  style={{ color: '#b0b0b0', fontSize: '11px', fontWeight: 500 }}
                >
                  ${ind.atr.toFixed(2)}
                </span>
                <span style={{ color: ctx.color, fontSize: '8px' }}>
                  {ctx.text}
                </span>
              </>
            )
          })()
        ) : (
          <span style={{ color: '#666666', fontSize: '11px' }}>
            {PLACEHOLDER}
          </span>
        )}
      </div>

      {/* BB BAND position */}
      <div style={chipStyle}>
        <Tooltip
          position="bottom"
          content="Bollinger Bands (20, 2σ). Above upper = overextended. Below lower = oversold. Inside = normal range."
        >
          <span style={chipLabelStyle}>BB</span>
        </Tooltip>
        {showTechSkeleton ? (
          <Shim width="50px" height={11} />
        ) : ind ? (
          (() => {
            const ref = ind.ema20
            if (ref === 0)
              return (
                <span
                  style={{ color: '#b0b0b0', fontSize: '10px', fontWeight: 500 }}
                >
                  DANS
                </span>
              )
            if (ref > ind.bbUpper)
              return (
                <span
                  style={{ color: '#f87171', fontSize: '10px', fontWeight: 500 }}
                >
                  AU-DESSUS
                </span>
              )
            if (ref < ind.bbLower)
              return (
                <span
                  style={{ color: '#4ade80', fontSize: '10px', fontWeight: 500 }}
                >
                  EN-DESSOUS
                </span>
              )
            return (
              <span
                style={{ color: '#b0b0b0', fontSize: '10px', fontWeight: 500 }}
              >
                DANS
              </span>
            )
          })()
        ) : (
          <span style={{ color: '#666666', fontSize: '11px' }}>
            {PLACEHOLDER}
          </span>
        )}
      </div>

      {/* AMPLITUDE — value + tiny inline progress bar so position
          is visible at a glance. */}
      <div style={chipStyle}>
        <Tooltip
          position="bottom"
          content="Where current price sits within today's high-low range. 0% = at low, 100% = at high. >70% extended (risky for new longs); <30% = room to run."
        >
          <span style={chipLabelStyle}>AMP.</span>
        </Tooltip>
        {showTechSkeleton ? (
          <Shim width="50px" height={11} />
        ) : ind ? (
          <>
            <span
              style={{
                color: dayRangeFillColor(ind.dayRangePct),
                fontSize: '11px',
                fontWeight: 500,
              }}
            >
              {ind.dayRangePct.toFixed(0)}%
            </span>
            <div
              style={{
                width: '32px',
                height: '3px',
                background: '#1e1e1e',
                borderRadius: '1px',
                overflow: 'hidden',
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
          </>
        ) : (
          <span style={{ color: '#666666', fontSize: '11px' }}>
            {PLACEHOLDER}
          </span>
        )}
      </div>

      {/* STATUS — pinned to the far right via marginLeft:auto so
          it absorbs any leftover horizontal space cleanly. No
          dead area on the right edge. */}
      <div style={{ ...chipStyle, marginLeft: 'auto' }}>
        <SectionDivider />
        <span style={{ color: '#666666', fontSize: '9px' }}>{upd}</span>
      </div>
    </div>
  )
}
