// PositionSizingCard — [PHASE-12.4] account-aware lot calculator.
//
// Drop-in card that surfaces the correct position size for the
// active analysis's entry / stop:
//
//   ACCOUNT  $10,000   RISK  0.5%   →   MAX LOSS  $50
//   STOP DISTANCE  $21.00 / oz
//   IDEAL  2.38 oz
//   STANDARD 0.00 lots  · MINI 0.20 lots  · MICRO 2.00 lots
//   ACTUAL RISK at MICRO  $42.00
//
// Uses the same terminal aesthetic as the rest of the dashboard.
// Inputs (account, risk %) persist across sessions via
// useTraderProfile. Reads the active analysis's entry/stop level
// strings directly so it stays in sync as new analyses fire.
//
// Designed to drop into AnalysisPanel above the trade-parameters
// block, OR be rendered as a standalone widget anywhere a level
// pair is available.

'use client'

import { useMemo } from 'react'
import {
  computePositionSizing,
  parseLevelString,
} from '@/lib/positionSizing'
import { useTraderProfile } from '@/lib/hooks/useTraderProfile'
import type { AnalysisResult, TradeDirection } from '@/lib/types'

interface Props {
  analysis: AnalysisResult | null
}

// Map AnalysisResult.recommendation → TradeDirection. FLAT
// returns null so the card can hide itself.
function recommendationToDirection(
  rec: AnalysisResult['recommendation']
): TradeDirection | null {
  if (rec === 'LONG') return 'LONG'
  if (rec === 'SHORT') return 'SHORT'
  return null
}

const LABEL_STYLE = {
  color: '#888888',
  fontSize: '8px',
  letterSpacing: '0.1em',
}

const VALUE_STYLE = {
  color: '#e5e5e5',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
}

export default function PositionSizingCard({ analysis }: Props) {
  const { profile, setProfile } = useTraderProfile()

  const sizing = useMemo(() => {
    if (!analysis) return null
    const direction = recommendationToDirection(analysis.recommendation)
    if (!direction) return null
    const entry = parseLevelString(analysis.entry)
    const stop = parseLevelString(analysis.stop)
    if (entry === null || stop === null) return null
    return computePositionSizing({
      profile,
      entry,
      stop,
      direction,
    })
  }, [analysis, profile])

  // No active LONG/SHORT trade idea — render a compact placeholder
  // that still surfaces the inputs, so the trader can pre-set
  // account & risk % during off-hours.
  const inactive = !sizing

  return (
    <div
      data-section="position-sizing-card"
      style={{
        border: '1px solid #1a1a1a',
        background: '#0c0c0c',
        padding: '8px 10px',
        marginTop: '6px',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div
        style={{
          ...LABEL_STYLE,
          marginBottom: '6px',
          letterSpacing: '0.15em',
        }}
      >
        DIMENSIONNEMENT
      </div>

      {/* Inputs — always visible so the trader can tune off-trade. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          marginBottom: inactive ? 0 : '8px',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={LABEL_STYLE}>COMPTE (USD)</span>
          <input
            type="number"
            min={1}
            step={100}
            value={profile.accountSize}
            onChange={(e) =>
              setProfile({ accountSize: Number(e.target.value) })
            }
            style={{
              ...VALUE_STYLE,
              background: '#0a0a0a',
              border: '1px solid #222',
              padding: '3px 5px',
              outline: 'none',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={LABEL_STYLE}>RISQUE %</span>
          <input
            type="number"
            min={0.1}
            max={5}
            step={0.05}
            value={profile.riskPct}
            onChange={(e) => setProfile({ riskPct: Number(e.target.value) })}
            style={{
              ...VALUE_STYLE,
              background: '#0a0a0a',
              border: '1px solid #222',
              padding: '3px 5px',
              outline: 'none',
            }}
          />
        </label>
      </div>

      {inactive ? (
        <div style={{ ...LABEL_STYLE, fontSize: '9px' }}>
          Pas de trade actionnable — calculs en pause.
        </div>
      ) : (
        <>
          {/* Risk envelope. */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '4px',
            }}
          >
            <span style={LABEL_STYLE}>PERTE MAX</span>
            <span style={VALUE_STYLE}>
              ${sizing.maxLossUsd.toFixed(2)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '4px',
            }}
          >
            <span style={LABEL_STYLE}>DISTANCE STOP</span>
            <span style={VALUE_STYLE}>
              ${sizing.stopDistance.toFixed(2)}/oz
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span style={LABEL_STYLE}>OUNCES IDÉAL</span>
            <span style={VALUE_STYLE}>{sizing.ouncesIdeal.toFixed(2)} oz</span>
          </div>

          {/* Lot grid — rounded down at each granularity. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '6px',
              borderTop: '1px solid #1a1a1a',
              paddingTop: '6px',
            }}
          >
            <div>
              <div style={LABEL_STYLE}>STD (100oz)</div>
              <div style={VALUE_STYLE}>
                {sizing.standardLots.toFixed(2)}
              </div>
              <div style={{ ...LABEL_STYLE, fontSize: '7px' }}>
                ${sizing.actualRiskAtStandard.toFixed(0)} risque
              </div>
            </div>
            <div>
              <div style={LABEL_STYLE}>MINI (10oz)</div>
              <div style={VALUE_STYLE}>{sizing.miniLots.toFixed(2)}</div>
              <div style={{ ...LABEL_STYLE, fontSize: '7px' }}>
                ${sizing.actualRiskAtMini.toFixed(0)} risque
              </div>
            </div>
            <div>
              <div style={LABEL_STYLE}>MICRO (1oz)</div>
              <div style={VALUE_STYLE}>{sizing.microLots.toFixed(2)}</div>
              <div style={{ ...LABEL_STYLE, fontSize: '7px' }}>
                ${sizing.actualRiskAtMicro.toFixed(0)} risque
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
