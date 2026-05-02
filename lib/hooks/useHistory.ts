// useHistory — read + manage analysis history persisted in
// localStorage. Loads every record on mount, exposes a saveAnalysis
// helper that AnalysisPanel calls on every successful run, and
// runs a background outcome checker on a 5-minute interval.
//
// [PHASE-1] The checker no longer polls /api/price for a
// point-in-time check at +2H and +4H. Instead, once a record is
// older than 4h+30min (Yahoo 5m feed lag buffer), it calls
// /api/replay for that record, gets the candle path, and
// classifies the outcome via lib/history.replayPath — which
// records which level was wick-touched FIRST and avoids the
// stop-then-target false positives the legacy classifier
// produced.
//
// Pure client-side hook. The lib/history.ts functions handle all
// localStorage I/O; this hook just orchestrates state + intervals
// and recomputes PersonalPatterns whenever history mutates.
//
// Cadence rationale (5 minutes): /api/replay's bufferOk gate
// makes the exact tick boundary unimportant — the path is
// immutable once the buffer passes. 5 minutes keeps replay
// network traffic to one round-trip per resolved record per
// session.
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
  updateOutcomeFromReplay,
  type ReplayCandle,
} from '@/lib/history'
import type {
  AnalysisHistoryRecord,
  AnalysisResult,
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

// [PHASE-1] Replay window + lag buffer.
//
// REPLAY_HORIZON_MS — how much price path we ask /api/replay
// for. 4h matches the original outcome window so existing
// behaviour ("did the trade resolve in a session-length
// window?") is preserved.
//
// REPLAY_BUFFER_MS — extra wait past the horizon before we
// consider the candle path complete. Yahoo's 5-min feed lags
// realtime by ~15-30min; without the buffer, a record that
// just crossed +4H would resolve against a truncated tail of
// candles and miss any near-edge hits.
const REPLAY_HORIZON_MS = 4 * 60 * 60 * 1000
const REPLAY_BUFFER_MS = 30 * 60 * 1000
const REPLAY_HORIZON_MIN = REPLAY_HORIZON_MS / 60 / 1000

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

  // [PHASE-1] Outcome-checker — runs every CHECK_INTERVAL_MS.
  // Lives inside a stable ref so the interval body picks up any
  // new state without re-creating the timer. Each tick:
  //   1. Find records older than (REPLAY_HORIZON_MS +
  //      REPLAY_BUFFER_MS) that don't yet have a hitOutcome and
  //      aren't tagged legacyOutcome.
  //   2. For each, fetch /api/replay?generatedAt=...
  //      sequentially (typical queue is 0-3 records; serial
  //      keeps load on Yahoo modest and avoids rate limits).
  //   3. If bufferOk=true and candleCount>0, write the outcome
  //      via updateOutcomeFromReplay. Otherwise skip — next tick
  //      retries.
  //   4. Refresh + dispatch event if anything was written.
  const checkerBusy = useRef(false)
  useEffect(() => {
    async function check() {
      if (checkerBusy.current) return
      checkerBusy.current = true
      try {
        const records = getHistory()
        if (records.length === 0) return

        // Bail early if no record is due — saves N round-trips
        // to /api/replay when the queue is fully resolved.
        const now = Date.now()
        const dueRecords = records.filter((r) => {
          if (r.hitOutcome !== undefined) return false
          if (r.legacyOutcome) return false
          const age = now - new Date(r.generatedAt).getTime()
          return age >= REPLAY_HORIZON_MS + REPLAY_BUFFER_MS
        })
        if (dueRecords.length === 0) return

        let wrote = false
        for (const r of dueRecords) {
          // Sequential per-record. Build URL with encodeURIComponent
          // even though ISO timestamps are URL-safe — defensive
          // against a future change to the persisted format.
          const params = new URLSearchParams({
            generatedAt: r.generatedAt,
            horizonMinutes: String(REPLAY_HORIZON_MIN),
          })
          let payload: {
            candleCount?: number
            candles?: ReplayCandle[]
            bufferOk?: boolean
          } | null = null
          try {
            const res = await window.fetch(
              `/api/replay?${params.toString()}`
            )
            if (!res.ok) continue
            payload = await res.json()
          } catch {
            // Network / parse failure on this record — skip; next
            // tick retries. Critically: we do NOT write a fake
            // INCONCLUSIVE here, so the record stays unresolved.
            continue
          }

          if (
            !payload ||
            payload.bufferOk !== true ||
            !Array.isArray(payload.candles) ||
            payload.candles.length === 0
          ) {
            // Buffer not yet passed (rare — we already filtered
            // by age) OR Yahoo returned an empty payload. Skip
            // and retry next tick.
            continue
          }

          if (updateOutcomeFromReplay(r.id, payload.candles)) {
            wrote = true
          }
        }

        if (wrote) {
          refresh()
          window.dispatchEvent(new CustomEvent(HISTORY_EVENT))
        }
      } catch {
        // Catch-all so the interval never dies on an unexpected
        // throw. Next tick retries.
      } finally {
        checkerBusy.current = false
      }
    }

    // Run once on mount so a record that crossed its replay
    // window while the app was closed gets resolved promptly,
    // then on the regular interval.
    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  return { history, patterns, saveAnalysis, refresh }
}
