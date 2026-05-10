// MacroExtrasRow — [PHASE-12.6] surfaces the new macro-depth data
// added in PHASE-12.2 (real yields, COT, cross-asset tickers) and
// PHASE-12.3 (ATR volatility regime) in a single horizontal row
// that sits below the existing SignalsPanel.
//
// The row reads from useMacro / useCot / useTechnicals / useSignals
// so it stays in sync with the rest of the dashboard. Each chip
// renders only when its source returned data — outage / cold-cache
// state collapses gracefully (the row shrinks instead of leaving
// gaps).
//
// Same terminal aesthetic as SignalsPanel: dark bg, monospace,
// tight spacing. Inline label/value to fit one line on desktop;
// flex-wrap fallback for narrower viewports.

'use client'

import { useMacro } from '@/lib/hooks/useMacro'
import { useCot } from '@/lib/hooks/useCot'
import { useSignals } from '@/lib/hooks/useSignals'
import { useTechnicals } from '@/lib/hooks/useTechnicals'

const CHIP_LABEL = {
  color: '#666',
  fontSize: '8px',
  letterSpacing: '0.1em',
  marginRight: '4px',
}

const CHIP_VALUE = {
  color: '#e5e5e5',
  fontSize: '10px',
  fontFamily: 'var(--font-mono)',
}

// Color the change cell — green for "favorable for gold", red for
// "unfavorable for gold" (real yields ↑ = bearish gold; same for
// breakevens fall, etc.). Falls back to neutral for chips where
// direction isn't clear-cut.
function favoritesGold(metric: string, change: number): string {
  switch (metric) {
    case 'realYield10y':
      return change < 0 ? '#4ade80' : change > 0 ? '#f87171' : '#888'
    case 'breakeven10y':
      // Higher breakevens = inflation expectations rising = bullish gold.
      return change > 0 ? '#4ade80' : change < 0 ? '#f87171' : '#888'
    case 'gsr':
      // Higher gold-silver ratio historically marks gold strength
      // vs. silver — ambiguous as a directional signal; leave neutral.
      return '#888'
    default:
      return '#888'
  }
}

// Coarse color for an ATR regime chip.
const ATR_REGIME_COLOR: Record<string, string> = {
  LOW: '#60a5fa',
  NORMAL: '#888',
  HIGH: '#fbbf24',
  EXTREME: '#f87171',
}

// COT net positioning extreme — top/bottom 5% historically marks
// reversion zones for managed-money positioning.
function cotPercentileColor(pct: number): string {
  if (pct >= 95) return '#f87171'      // contrarian short
  if (pct >= 85) return '#fb923c'
  if (pct <= 5) return '#4ade80'       // contrarian long
  if (pct <= 15) return '#84cc16'
  return '#888'
}

export default function MacroExtrasRow() {
  const macro = useMacro()
  const cot = useCot()
  const signals = useSignals()
  const technicals = useTechnicals()

  // Gold-Silver Ratio — only when both XAU spot and XAG quote
  // are present.
  const gsr =
    technicals.indicators &&
    signals.data?.xag &&
    signals.data.xag.price > 0
      ? // Use the chart's last close as a proxy for current XAU.
        // The PriceBar already does this; we mirror so we don't
        // need an extra hook just for spot.
        (() => {
          const lastCandle =
            technicals.chartCandles[technicals.chartCandles.length - 1]
          if (!lastCandle) return null
          return lastCandle.close / signals.data!.xag!.price
        })()
      : null

  // Render only if at least ONE chip has data — otherwise the
  // row collapses entirely.
  const realYield = macro.data?.realYield10y
  const breakeven = macro.data?.breakeven10y
  const atrSummary = technicals.atrSummary
  const cotData = cot.data && cot.data.reportDate ? cot.data : null

  const anyData =
    realYield !== undefined ||
    breakeven !== undefined ||
    atrSummary !== null ||
    gsr !== null ||
    cotData !== null

  if (!anyData) return null

  return (
    <div
      data-section="macro-extras"
      style={{
        background: '#0a0a0a',
        borderBottom: '1px solid #161616',
        padding: '4px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        flexWrap: 'wrap',
        fontFamily: 'var(--font-mono)',
        height: '24px',
        minHeight: '24px',
      }}
    >
      <span
        style={{
          fontSize: '7px',
          color: '#444',
          letterSpacing: '0.15em',
          padding: '1px 5px',
          background: '#0d0d0d',
          border: '1px solid #1a1a1a',
        }}
        title="Données macro étendues (PHASE-12.2 / PHASE-12.3)"
      >
        MACRO+
      </span>

      {realYield ? (
        <span
          title="Rendement réel 10Y (TIPS, FRED DFII10) — moteur structurel de l'or."
        >
          <span style={CHIP_LABEL}>RÉEL 10Y</span>
          <span style={CHIP_VALUE}>{realYield.value.toFixed(2)}%</span>
          <span
            style={{
              ...CHIP_VALUE,
              fontSize: '8px',
              marginLeft: '4px',
              color: favoritesGold('realYield10y', realYield.change),
            }}
          >
            {realYield.change >= 0 ? '+' : ''}
            {realYield.change.toFixed(2)}
          </span>
        </span>
      ) : null}

      {breakeven ? (
        <span
          title="Inflation breakeven 10Y (FRED T10YIE) — anticipations d'inflation, soutien structurel à l'or."
        >
          <span style={CHIP_LABEL}>INFL 10Y</span>
          <span style={CHIP_VALUE}>{breakeven.value.toFixed(2)}%</span>
          <span
            style={{
              ...CHIP_VALUE,
              fontSize: '8px',
              marginLeft: '4px',
              color: favoritesGold('breakeven10y', breakeven.change),
            }}
          >
            {breakeven.change >= 0 ? '+' : ''}
            {breakeven.change.toFixed(2)}
          </span>
        </span>
      ) : null}

      {gsr !== null ? (
        <span title="Ratio Or/Argent (XAU/XAG). Hausse = or relativement plus fort que l'argent.">
          <span style={CHIP_LABEL}>GSR</span>
          <span style={CHIP_VALUE}>{gsr.toFixed(2)}</span>
        </span>
      ) : null}

      {atrSummary ? (
        <span
          title={`Régime de volatilité — ATR(14) au ${atrSummary.percentile}e percentile sur ${atrSummary.windowDays}j.`}
        >
          <span style={CHIP_LABEL}>VOL</span>
          <span
            style={{
              ...CHIP_VALUE,
              color: ATR_REGIME_COLOR[atrSummary.regime] ?? '#888',
              fontWeight: 600,
            }}
          >
            {atrSummary.regime}
          </span>
          <span style={{ ...CHIP_VALUE, fontSize: '8px', marginLeft: '4px', color: '#666' }}>
            {atrSummary.percentile}%
          </span>
        </span>
      ) : null}

      {cotData ? (
        <span
          title={`Positionnement Managed-Money COMEX au ${cotData.reportDate} — net ${cotData.managedMoneyNet >= 0 ? 'long' : 'short'}, percentile ${cotData.netPercentile5y} sur 5 ans.`}
        >
          <span style={CHIP_LABEL}>COT MM</span>
          <span style={CHIP_VALUE}>
            {cotData.managedMoneyNet >= 0 ? '+' : ''}
            {Math.round(cotData.managedMoneyNet / 1000)}k
          </span>
          <span
            style={{
              ...CHIP_VALUE,
              fontSize: '8px',
              marginLeft: '4px',
              color: cotPercentileColor(cotData.netPercentile5y),
            }}
          >
            P{cotData.netPercentile5y}
          </span>
        </span>
      ) : null}
    </div>
  )
}
