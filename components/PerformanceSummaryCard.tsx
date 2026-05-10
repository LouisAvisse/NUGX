// PerformanceSummaryCard — [PHASE-12.6] one-glance trader stats.
//
// Reads the journal from localStorage, runs computePerformance()
// from lib/performanceAnalytics, and renders a tight 6-cell grid
// of the headline metrics:
//
//   EXP        $/trade          PROFIT FACTOR  X.YY
//   WIN RATE   %                MAX DD         $abs (-pct%)
//   PAYOFF     X.YY             SHARPE         A.NN
//
// Each cell hides itself when the metric is null (insufficient
// sample). When the journal has < 3 closed trades, the whole
// card collapses to a one-line educational placeholder.
//
// A "EXPORT CSV" button at the bottom dumps the closed-trade
// journal so the trader can do their own analysis offline.

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  computePerformance,
  type PerformanceSummary,
} from '@/lib/performanceAnalytics'
import {
  exportJournalCsv,
  downloadAsFile,
} from '@/lib/historyExport'
import type { JournalEntry } from '@/lib/types'

const STORAGE_KEY = 'goldDashboard_journal'

const LABEL = {
  color: '#666',
  fontSize: '7px',
  letterSpacing: '0.12em',
}

const VALUE = {
  color: '#e5e5e5',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
}

const POSITIVE = '#4ade80'
const NEGATIVE = '#f87171'
const NEUTRAL = '#e5e5e5'

function loadJournal(): JournalEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as JournalEntry[]) : []
  } catch {
    return []
  }
}

function valueColor(metric: number | null, kind: 'pnl' | 'ratio' | 'pct'): string {
  if (metric === null) return NEUTRAL
  if (kind === 'pnl') return metric > 0 ? POSITIVE : metric < 0 ? NEGATIVE : NEUTRAL
  if (kind === 'ratio') return metric >= 1 ? POSITIVE : NEGATIVE
  return NEUTRAL
}

export default function PerformanceSummaryCard() {
  const [entries, setEntries] = useState<JournalEntry[]>([])

  // Refresh on mount + on cross-tab journal updates so closing a
  // trade in another tab updates the card here.
  useEffect(() => {
    setEntries(loadJournal())
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setEntries(loadJournal())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const summary: PerformanceSummary = useMemo(
    () => computePerformance(entries),
    [entries]
  )

  // Cold start — under 3 closed trades, render a tiny placeholder
  // so the panel doesn't show empty zeros.
  if (summary.totalClosed < 3) {
    return (
      <div
        data-section="performance-summary"
        style={{
          marginTop: '6px',
          border: '1px solid #1a1a1a',
          background: '#0c0c0c',
          padding: '6px 10px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ ...LABEL, marginBottom: '2px', letterSpacing: '0.15em' }}>
          PERFORMANCE
        </div>
        <div style={{ ...LABEL, fontSize: '9px' }}>
          {summary.totalClosed === 0
            ? 'Aucun trade clos pour le moment.'
            : `Encore ${3 - summary.totalClosed} trade${3 - summary.totalClosed > 1 ? 's' : ''} clos avant l'activation des stats.`}
        </div>
      </div>
    )
  }

  function onExport() {
    const csv = exportJournalCsv(entries)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadAsFile(csv, `nugx-journal-${stamp}.csv`, 'text/csv')
  }

  // Format helpers — null guards inline so each cell self-renders.
  const fmtUsd = (n: number | null) =>
    n === null ? '——' : `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`
  const fmtRatio = (n: number | null) => (n === null ? '——' : n.toFixed(2))
  const fmtPct = (n: number | null) =>
    n === null ? '——' : `${(n * 100).toFixed(0)}%`

  return (
    <div
      data-section="performance-summary"
      style={{
        marginTop: '6px',
        border: '1px solid #1a1a1a',
        background: '#0c0c0c',
        padding: '8px 10px',
        fontFamily: 'var(--font-mono)',
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
        <div style={{ ...LABEL, letterSpacing: '0.15em' }}>
          PERFORMANCE · {summary.totalClosed} CLOS
        </div>
        <button
          type="button"
          onClick={onExport}
          title="Télécharger le journal en CSV"
          style={{
            background: '#0a0a0a',
            border: '1px solid #222',
            color: '#888',
            fontSize: '7px',
            letterSpacing: '0.1em',
            padding: '2px 6px',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          ⇩ CSV
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px 10px',
        }}
      >
        <div>
          <div style={LABEL}>EXPECTANCY</div>
          <div
            style={{
              ...VALUE,
              color: valueColor(summary.expectancy, 'pnl'),
            }}
          >
            {fmtUsd(summary.expectancy)}
          </div>
        </div>
        <div>
          <div style={LABEL}>PROFIT FACTOR</div>
          <div
            style={{
              ...VALUE,
              color: valueColor(summary.profitFactor, 'ratio'),
            }}
          >
            {fmtRatio(summary.profitFactor)}
          </div>
        </div>
        <div>
          <div style={LABEL}>WIN RATE</div>
          <div style={VALUE}>{fmtPct(summary.winRate)}</div>
        </div>
        <div>
          <div style={LABEL}>PAYOFF</div>
          <div style={VALUE}>{fmtRatio(summary.payoffRatio)}</div>
        </div>
        <div>
          <div style={LABEL}>MAX DD</div>
          <div
            style={{
              ...VALUE,
              color: summary.maxDrawdownAbs > 0 ? NEGATIVE : NEUTRAL,
            }}
          >
            {summary.maxDrawdownAbs === 0
              ? '——'
              : `−$${summary.maxDrawdownAbs.toFixed(0)}`}
          </div>
          {summary.maxDrawdownPct !== null ? (
            <div style={{ ...LABEL, fontSize: '7px' }}>
              −{summary.maxDrawdownPct.toFixed(1)}%
            </div>
          ) : null}
        </div>
        <div>
          <div style={LABEL}>SHARPE A.</div>
          <div
            style={{
              ...VALUE,
              color: valueColor(summary.sharpeAnnualized, 'ratio'),
            }}
          >
            {fmtRatio(summary.sharpeAnnualized)}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: '6px',
          ...LABEL,
          fontSize: '7px',
          opacity: 0.7,
        }}
        title="Streaks consécutifs gains / pertes maximum dans le journal."
      >
        Streak max — gains: {summary.maxConsecutiveWins} · pertes: {summary.maxConsecutiveLosses}
      </div>
    </div>
  )
}
