// useTradeManager — [PHASE-5] watches OPEN journal entries against
// the live price and advances each entry's mgmtState through:
//
//   INITIAL    →  TRAIL_60     →  PARTIAL_80
//                                         ↘
//                              STOPPED  /  TIME_STOP  (terminal)
//
// Why this exists: retail traders' single biggest leak is exit
// management. They size correctly, time entries fine, then hold
// winners too long (giving back to mean-reversion) or cut losers
// too late (riding the stop blow-out). A senior trader watching
// over their shoulder would say:
//   "You're 60% to target — start trailing the stop."
//   "You're 80% to target — take half off, let the rest run."
//   "It's been 8 hours and we're nowhere — the thesis is stale."
// This hook does that.
//
// Pure client-side, runs on every (entries, livePrice) change.
// No new timers — useGoldPrice already polls 30s; the journal
// hook already refreshes on writes. Mutations go through
// lib/journal.ts so the storage layer owns the monotonic-state
// rule.

'use client'

import { useEffect } from 'react'
import { markMgmtNotified, setMgmtState } from '@/lib/journal'
import type { JournalEntry, TradeMgmtState } from '@/lib/types'

// Time-stop threshold — open trades sitting >TIME_STOP_HOURS
// hours with <TIME_STOP_PROGRESS_PCT progress to target are
// flagged as stale. Numbers chosen for gold day-trading
// (typical 1-4h holds) — a position open >8h has lost the
// session that motivated the entry.
const TIME_STOP_HOURS = 8
const TIME_STOP_PROGRESS_PCT = 40

// Trailing + partial milestones. Both are pure progress %
// thresholds; they don't depend on absolute prices so the
// numbers transfer across instruments if the project ever
// expands beyond gold.
const TRAIL_PCT = 60
const PARTIAL_PCT = 80

interface UseTradeManagerParams {
  entries: JournalEntry[]
  livePrice: number | null
  onUpdate?: () => void   // called when a state actually advanced
}

// Compute "progress to target" as a 0..100 number.
//
//   LONG : (price - entry) / (target - entry) * 100
//   SHORT: (entry - price) / (entry - target) * 100
//
// Negative values mean the trade is in adverse territory; we
// return them so the time-stop / stopped checks can still see
// where price actually is. Caller clamps to [0, 100] when the
// % is rendered to the trader.
function progressPct(entry: JournalEntry, price: number): number {
  const span =
    entry.direction === 'LONG'
      ? entry.target - entry.entry
      : entry.entry - entry.target
  if (!Number.isFinite(span) || span === 0) return 0
  const move =
    entry.direction === 'LONG' ? price - entry.entry : entry.entry - price
  return (move / span) * 100
}

// Check if the live price has hit the stop level, accounting
// for direction. Stop is a hard exit signal regardless of
// previous state.
function stoppedOut(entry: JournalEntry, price: number): boolean {
  if (entry.direction === 'LONG') return price <= entry.stop
  return price >= entry.stop
}

// Decide the next mgmtState for one open entry given live price.
// Returns null when no transition is warranted. Order matters:
// STOPPED is checked first (highest severity), then PARTIAL_80,
// TRAIL_60, TIME_STOP.
function nextState(
  entry: JournalEntry,
  price: number,
  now: number
): TradeMgmtState | null {
  const current = entry.mgmtState ?? 'INITIAL'
  if (current === 'STOPPED' || current === 'TIME_STOP') return null

  if (stoppedOut(entry, price)) return 'STOPPED'

  const pct = progressPct(entry, price)
  if (pct >= PARTIAL_PCT) return 'PARTIAL_80'
  if (pct >= TRAIL_PCT) return 'TRAIL_60'

  // Time-stop check — only flags when we're nowhere near target
  // and the clock has expired. Older trades in profit naturally
  // pass the PARTIAL/TRAIL checks above first, so they never
  // reach this branch.
  const ageHours = (now - new Date(entry.createdAt).getTime()) / 3_600_000
  if (ageHours >= TIME_STOP_HOURS && pct < TIME_STOP_PROGRESS_PCT) {
    return 'TIME_STOP'
  }

  return null
}

// Browser notification for a state transition. Best-effort —
// permission must already be granted (useEntryWatcher's UI
// surfaces the activation button). Title is direction-aware so
// the trader can scan the OS notification without context.
function notify(entry: JournalEntry, state: TradeMgmtState): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  const dir = entry.direction
  let title = ''
  let body = ''
  switch (state) {
    case 'TRAIL_60':
      title = `NUGX — ${dir} à 60% de l'objectif`
      body = `Position ${dir} ouverte à $${entry.entry.toFixed(2)} : envisager de remonter le stop sous le swing récent.`
      break
    case 'PARTIAL_80':
      title = `NUGX — ${dir} à 80% de l'objectif`
      body = `Position ${dir} ouverte à $${entry.entry.toFixed(2)} : prendre une partie du profit, laisser courir le reste.`
      break
    case 'STOPPED':
      title = `NUGX — ${dir} stoppé`
      body = `Position ${dir} ouverte à $${entry.entry.toFixed(2)} : prix au stop $${entry.stop.toFixed(2)}.`
      break
    case 'TIME_STOP':
      title = `NUGX — ${dir} thèse périmée`
      body = `Position ${dir} ouverte depuis plus de ${TIME_STOP_HOURS}h sans progrès — réévaluer.`
      break
    default:
      return
  }
  try {
    new Notification(title, { body, tag: `nugx-mgmt-${entry.id}-${state}` })
  } catch {
    // Notification constructor can throw under pinned-tab
    // restrictions; the chip in JournalPanel still informs.
  }
}

export function useTradeManager({
  entries,
  livePrice,
  onUpdate,
}: UseTradeManagerParams): void {
  useEffect(() => {
    if (livePrice === null || !Number.isFinite(livePrice) || livePrice <= 0) return
    const now = Date.now()
    let touched = false
    for (const entry of entries) {
      // Skip closed positions — only open trades need management.
      if (entry.exitPrice !== undefined) continue
      const next = nextState(entry, livePrice, now)
      if (!next) continue
      const advanced = setMgmtState(entry.id, next)
      if (!advanced) continue
      // Only notify if we haven't already pinged for this state.
      const already = (entry.mgmtNotifiedStates ?? []).includes(next)
      if (!already) {
        notify(entry, next)
        markMgmtNotified(entry.id, next)
      }
      touched = true
    }
    if (touched && onUpdate) onUpdate()
  }, [entries, livePrice, onUpdate])
}

// Public helper for UI — French label + palette per state. Kept
// next to the hook so a new state added here doesn't drift from
// its display.
export function displayMgmtState(state: TradeMgmtState | undefined): {
  label: string
  color: string
  background: string
  border: string
} | null {
  switch (state) {
    case 'TRAIL_60':
      return {
        label: '◐ TRAILER 60%',
        color: '#fbbf24',
        background: '#1a1500',
        border: '1px solid #3a2e00',
      }
    case 'PARTIAL_80':
      return {
        label: '◑ PARTIEL 80%',
        color: '#4ade80',
        background: '#0a1a0a',
        border: '1px solid #1a3a1a',
      }
    case 'STOPPED':
      return {
        label: '✕ STOPPÉ',
        color: '#f87171',
        background: '#1a0a0a',
        border: '1px solid #3a1a1a',
      }
    case 'TIME_STOP':
      return {
        label: '⏱ THÈSE PÉRIMÉE',
        color: '#888888',
        background: '#161616',
        border: '1px solid #2a2a2a',
      }
    case 'INITIAL':
    case undefined:
    default:
      return null
  }
}
