// useHistory — read + manage analysis history persisted in
// localStorage. Loads every record on mount, exposes a saveAnalysis
// helper that AnalysisPanel calls on every successful run, and
// runs a background outcome checker on a 5-minute interval that
// classifies each record's +2H and +4H result against the live
// gold price.
//
// Pure client-side hook. The lib/history.ts functions handle all
// localStorage I/O; this hook just orchestrates state + intervals
// and recomputes PersonalPatterns whenever history mutates.
//
// Cadence rationale (5 minutes): the 2H / 4H thresholds are
// loose, so we don't need second-level precision. 5 minutes keeps
// the storage write rate trivially low while still catching the
// 2H/4H boundary within a few minutes of when it actually
// happens. A page open continuously through both windows fires
// the checker ~24 times/hour on the 4H window — fine.
//
// History updates propagate through a custom 'historyUpdated'
// window event so other parts of the app (e.g. JournalPanel's
// MEMORY tab) can refresh without prop-drilling. Dispatched on
// saveAnalysis + on every checker pass that wrote a new outcome.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getHistory,
  getPersonalPatterns,
  saveAnalysis as saveAnalysisToStorage,
  updateOutcome,
} from '@/lib/history'
import type {
  AnalysisHistoryRecord,
  AnalysisResult,
  GoldPrice,
  PersonalPatterns,
} from '@/lib/types'

interface UseHistoryReturn {
  history: AnalysisHistoryRecord[]
  patterns: PersonalPatterns | null
  saveAnalysis: (
    result: AnalysisResult,
    price: number,
    session: string
  ) => void
  refresh: () => void
}

// Outcome-checker cadence — 5 minutes. See header rationale.
const CHECK_INTERVAL_MS = 5 * 60 * 1000

// 2H and 4H thresholds in milliseconds. Records younger than 2H
// don't get any outcome write yet; between 2H and 4H they get a
// 2H write only; after 4H they get the 4H write. checkedAt2H /
// checkedAt4H are used to deduplicate so we never write twice.
const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

// Custom window event other components listen for to refresh
// their own derived state when history changes.
const HISTORY_EVENT = 'historyUpdated'

export function useHistory(): UseHistoryReturn {
  const [history, setHistory] = useState<AnalysisHistoryRecord[]>([])
  const [patterns, setPatterns] = useState<PersonalPatterns | null>(null)

  // Refresh is the single state-mutation primitive: re-read
  // history from storage, recompute patterns, set both. Wrapped
  // in useCallback so the effect deps stay stable.
  const refresh = useCallback(() => {
    setHistory(getHistory())
    setPatterns(getPersonalPatterns())
  }, [])

  // Initial load — fire once on mount.
  useEffect(() => {
    refresh()
  }, [refresh])

  // Listen for cross-component history events so a save in one
  // place (e.g. AnalysisPanel) propagates to a consumer in
  // another (e.g. JournalPanel MEMORY tab).
  useEffect(() => {
    function handler() {
      refresh()
    }
    window.addEventListener(HISTORY_EVENT, handler)
    return () => window.removeEventListener(HISTORY_EVENT, handler)
  }, [refresh])

  const saveAnalysis = useCallback(
    (result: AnalysisResult, price: number, session: string) => {
      saveAnalysisToStorage(result, price, session)
      // Local refresh so the calling component sees the new
      // record immediately; cross-component listeners refresh
      // via the custom event.
      refresh()
      window.dispatchEvent(new CustomEvent(HISTORY_EVENT))
    },
    [refresh]
  )

  // Outcome-checker — runs every CHECK_INTERVAL_MS. Lives inside
  // a stable ref so the interval body picks up any new state
  // without re-creating the timer. Each tick:
  //   1. Pull current price from /api/price (single source of truth).
  //   2. For each record, decide whether the 2H or 4H write is
  //      due (and not already written), call updateOutcome.
  //   3. Refresh + dispatch event if anything was written.
  const checkerBusy = useRef(false)
  useEffect(() => {
    async function check() {
      if (checkerBusy.current) return
      checkerBusy.current = true
      try {
        const records = getHistory()
        if (records.length === 0) return

        // Bail early if no record is due — saves a /api/price
        // round-trip when the queue is fully checked.
        const now = Date.now()
        const someDue = records.some((r) => {
          const age = now - new Date(r.generatedAt).getTime()
          const due2h =
            age >= TWO_HOURS_MS &&
            r.outcome2H === undefined &&
            r.checkedAt2H === undefined
          const due4h =
            age >= FOUR_HOURS_MS &&
            r.outcome4H === undefined &&
            r.checkedAt4H === undefined
          return due2h || due4h
        })
        if (!someDue) return

        const res = await window.fetch('/api/price')
        if (!res.ok) return
        const price = (await res.json()) as GoldPrice
        if (typeof price.price !== 'number' || !Number.isFinite(price.price)) return

        let wrote = false
        for (const r of records) {
          const age = now - new Date(r.generatedAt).getTime()
          if (
            age >= TWO_HOURS_MS &&
            r.outcome2H === undefined &&
            r.checkedAt2H === undefined
          ) {
            updateOutcome(r.id, '2H', price.price)
            wrote = true
          }
          if (
            age >= FOUR_HOURS_MS &&
            r.outcome4H === undefined &&
            r.checkedAt4H === undefined
          ) {
            updateOutcome(r.id, '4H', price.price)
            wrote = true
          }
        }
        if (wrote) {
          refresh()
          window.dispatchEvent(new CustomEvent(HISTORY_EVENT))
        }
      } catch {
        // Network / parse failure — try again on the next tick.
      } finally {
        checkerBusy.current = false
      }
    }

    // Run once on mount so a record that crossed its 2H/4H
    // boundary while the app was closed gets resolved promptly,
    // then on the regular interval.
    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  return { history, patterns, saveAnalysis, refresh }
}
