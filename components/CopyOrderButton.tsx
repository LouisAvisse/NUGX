// CopyOrderButton — [PHASE-12.4] one-click order ticket clipboard.
//
// Renders a single button that, on click, formats the active
// analysis's entry/stop/target into the trader's chosen execution
// platform syntax and writes it to navigator.clipboard.
//
// Default format is MT5; the button cycles MT5 → cTrader →
// TradingView → Plain on each subsequent click within the same
// "press" cycle. The selected format is sticky in localStorage so
// the trader's preference survives reloads.
//
// Lot size is fixed at the most-common retail default (0.10 / 10oz).
// The trader sizes their own position in their broker — this button
// only ships the level template; size is intentionally not opinionated.

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  copyOrderToClipboard,
  formatOrder,
  type OrderFormat,
  type OrderTicket,
} from '@/lib/orderClipboard'
import type { AnalysisResult, TradeDirection } from '@/lib/types'

const DEFAULT_LOT_SIZE = 0.1

function parseLevelString(raw: string): number | null {
  if (!raw) return null
  const match = raw.match(/-?\d+(?:[.,]\d+)?/)
  if (!match) return null
  const n = Number(match[0].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const STORAGE_KEY = 'goldDashboard_orderFormat'
const FORMAT_CYCLE: OrderFormat[] = ['MT5', 'CTRADER', 'TRADINGVIEW', 'PLAIN']

interface Props {
  analysis: AnalysisResult | null
  // Optional override — when omitted the component falls back to
  // the active analysis's own recommendation.
  symbol?: string
}

function recommendationToDirection(
  rec: AnalysisResult['recommendation']
): TradeDirection | null {
  if (rec === 'LONG') return 'LONG'
  if (rec === 'SHORT') return 'SHORT'
  return null
}

function loadFormat(): OrderFormat {
  if (typeof window === 'undefined') return 'MT5'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw && FORMAT_CYCLE.includes(raw as OrderFormat)) {
      return raw as OrderFormat
    }
  } catch {
    // Quota / private mode — ignore.
  }
  return 'MT5'
}

function saveFormat(format: OrderFormat): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, format)
  } catch {
    // ignore
  }
}

export default function CopyOrderButton({ analysis, symbol = 'XAUUSD' }: Props) {
  const [format, setFormat] = useState<OrderFormat>(loadFormat)
  const [feedback, setFeedback] = useState<'idle' | 'copied' | 'failed'>('idle')

  // Keep state in sync with localStorage on first mount (the
  // loadFormat default in useState happens before SSR rehydrates).
  useEffect(() => {
    setFormat(loadFormat())
  }, [])

  // Compute the ticket from the active analysis. null when the
  // recommendation isn't actionable; the parent already gates on
  // recommendation !== 'FLAT' so this is mostly defensive.
  const ticket = useMemo<OrderTicket | null>(() => {
    if (!analysis) return null
    const direction = recommendationToDirection(analysis.recommendation)
    if (!direction) return null
    const entry = parseLevelString(analysis.entry)
    const stop = parseLevelString(analysis.stop)
    const target = parseLevelString(analysis.target)
    if (entry === null || stop === null || target === null) return null

    return { symbol, direction, lotSize: DEFAULT_LOT_SIZE, entry, stop, target }
  }, [analysis, symbol])

  if (!ticket) return null

  const previewText = formatOrder(ticket, format)

  async function onCopy() {
    if (!ticket) return
    const ok = await copyOrderToClipboard(ticket, format)
    setFeedback(ok ? 'copied' : 'failed')
    setTimeout(() => setFeedback('idle'), 1500)
  }

  function onCycleFormat(e: React.MouseEvent) {
    e.stopPropagation()
    const idx = FORMAT_CYCLE.indexOf(format)
    const next = FORMAT_CYCLE[(idx + 1) % FORMAT_CYCLE.length]
    setFormat(next)
    saveFormat(next)
  }

  return (
    <div
      data-section="copy-order"
      style={{
        marginTop: '6px',
        border: '1px solid #1a1a1a',
        background: '#0c0c0c',
        padding: '6px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <button
        type="button"
        onClick={onCycleFormat}
        title="Cliquer pour changer de format (MT5 / cTrader / TradingView / Texte)"
        style={{
          background: '#0a0a0a',
          border: '1px solid #222',
          color: '#888',
          fontSize: '7px',
          letterSpacing: '0.1em',
          padding: '2px 4px',
          cursor: 'pointer',
        }}
      >
        {format}
      </button>
      <button
        type="button"
        onClick={onCopy}
        style={{
          flex: 1,
          background:
            feedback === 'copied'
              ? '#0d2515'
              : feedback === 'failed'
                ? '#251515'
                : '#0a0a0a',
          border:
            feedback === 'copied'
              ? '1px solid #1f4a2c'
              : feedback === 'failed'
                ? '1px solid #4a1f1f'
                : '1px solid #222',
          color:
            feedback === 'copied'
              ? '#4ade80'
              : feedback === 'failed'
                ? '#f87171'
                : '#e5e5e5',
          fontSize: '9px',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          padding: '4px 6px',
          cursor: 'pointer',
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {feedback === 'copied'
          ? '✓ COPIÉ'
          : feedback === 'failed'
            ? '✗ ÉCHEC'
            : `📋 ${previewText}`}
      </button>
    </div>
  )
}
