// useEntryWatcher — [PHASE-4] streaming entry-trigger watcher.
//
// The retail-trader's biggest disadvantage versus a desk pro is
// continuous monitoring. The pro watches every tick; retail
// reads a card, walks away, comes back to find the entry has
// already moved 0.4% past their planned price. This hook closes
// that gap: it runs in the background, watches the live price
// against the latest analysis's entry zone, and fires a browser
// notification the moment price actually enters the zone in the
// expected direction.
//
// Pure client-side. Reads:
//   - `analysis`: the AnalysisResult to watch (entry zone, rec).
//   - live price tick (the caller wires this from useGoldPrice).
//
// Trigger logic:
//   - LONG : alert when price ENTERS the entry zone from above
//            (i.e. previous tick was above the zone high).
//   - SHORT: alert when price ENTERS the zone from below.
//   - FLAT : never alerts.
//
// De-duplication: each AnalysisResult fires at most once. The
// "armed-but-not-fired" record is keyed by analysis.generatedAt
// in localStorage so a page reload doesn't re-arm a stale
// alert that already fired.

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { parsePrice } from '@/lib/utils'
import type { AnalysisResult } from '@/lib/types'

// Storage key for the "we already fired" set. Keyed by
// generatedAt — survives reloads, expires naturally as analyses
// roll over.
const FIRED_KEY = 'goldDashboard_entryWatcherFired'
const MAX_FIRED_KEEP = 50

// Notification permission states the hook surfaces back to the
// UI. UNSUPPORTED is for environments without the Notification
// API (rare on modern browsers but possible in iframes).
export type NotificationPermissionState =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied'

// What the hook reports back to its caller — used by the UI
// to render a "armed" badge + a request-permission button.
export interface UseEntryWatcherReturn {
  permission: NotificationPermissionState
  armed: boolean
  fired: boolean
  requestPermission: () => Promise<void>
}

// Read the dedupe set from storage; return [] on any error so
// a stale write never disables the watcher entirely.
function readFired(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FIRED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

// Write the dedupe set, trimming oldest entries so it never
// grows unbounded.
function writeFired(ids: string[]): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = ids.slice(-MAX_FIRED_KEEP)
    window.localStorage.setItem(FIRED_KEY, JSON.stringify(trimmed))
  } catch {
    // Quota / serialize failure — drop. Worst case the alert
    // re-fires after a reload, no data loss.
  }
}

// Parse an entry zone string into [low, high]. Accepts:
//   - "3281-3284" → [3281, 3284]
//   - "3281"      → [3281, 3281]
//   - "——"        → null (no zone, watcher inactive)
function parseZone(entry: string): [number, number] | null {
  if (!entry || entry === '——') return null
  const parts = entry.split('-').map((p) => Number(parsePrice(p.trim())))
  if (parts.length === 0) return null
  const valid = parts.filter((n) => Number.isFinite(n) && n > 0)
  if (valid.length === 0) return null
  if (valid.length === 1) return [valid[0], valid[0]]
  const lo = Math.min(...valid)
  const hi = Math.max(...valid)
  return [lo, hi]
}

// Resolve the current Notification permission to our enum.
function resolvePermission(): NotificationPermissionState {
  if (typeof window === 'undefined') return 'unsupported'
  if (typeof Notification === 'undefined') return 'unsupported'
  const p = Notification.permission
  if (p === 'granted') return 'granted'
  if (p === 'denied') return 'denied'
  return 'default'
}

// ─────────────────────────────────────────────────────────────────
// Public hook.
//
// Caller passes the latest AnalysisResult (or null when there
// is none) plus the live price. The hook runs no timers — it
// reacts on every price change the caller surfaces. That keeps
// the implementation trivial: useGoldPrice already polls every
// 30s, so a price tick == a watcher tick.
// ─────────────────────────────────────────────────────────────────
export function useEntryWatcher(
  analysis: AnalysisResult | null,
  livePrice: number | null
): UseEntryWatcherReturn {
  const [permission, setPermission] = useState<NotificationPermissionState>(
    () => resolvePermission()
  )
  const [fired, setFired] = useState(false)
  const previousPriceRef = useRef<number | null>(null)

  // Refresh permission state on mount + whenever the user might
  // have toggled it via browser settings. We can't observe
  // changes directly, but re-checking on each render is cheap
  // and self-corrects on a page reload.
  useEffect(() => {
    setPermission(resolvePermission())
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'granted') {
      setPermission('granted')
      return
    }
    try {
      const result = await Notification.requestPermission()
      if (result === 'granted') setPermission('granted')
      else if (result === 'denied') setPermission('denied')
      else setPermission('default')
    } catch {
      // Some browsers throw on the legacy callback signature;
      // treat as denied so the UI can guide the user.
      setPermission('denied')
    }
  }, [])

  // Reset `fired` whenever a new analysis lands — each
  // AnalysisResult gets its own one-shot.
  useEffect(() => {
    if (!analysis) {
      setFired(false)
      return
    }
    const dedupe = readFired()
    setFired(dedupe.includes(analysis.generatedAt))
  }, [analysis])

  // Detection effect — runs on every (analysis, price) change.
  useEffect(() => {
    // No watcher if no analysis or no actionable rec.
    if (!analysis) return
    if (analysis.recommendation === 'FLAT') return
    if (livePrice === null || !Number.isFinite(livePrice) || livePrice <= 0) {
      previousPriceRef.current = livePrice
      return
    }

    const zone = parseZone(analysis.entry)
    const prev = previousPriceRef.current
    previousPriceRef.current = livePrice

    if (!zone) return
    if (fired) return

    const [lo, hi] = zone
    const isLong = analysis.recommendation === 'LONG'

    // Need a previous tick to detect a CROSSING into the zone.
    // First tick simply seeds previousPriceRef without firing.
    if (prev === null) return

    let triggered = false
    if (isLong) {
      // LONG entry: pullback from above into the zone. Trigger
      // when the previous tick was strictly above hi AND the
      // current tick is at-or-below hi (and at-or-above lo).
      triggered = prev > hi && livePrice <= hi && livePrice >= lo
    } else {
      // SHORT entry: bounce from below into the zone. Trigger
      // when the previous tick was strictly below lo AND the
      // current tick is at-or-above lo (and at-or-below hi).
      triggered = prev < lo && livePrice >= lo && livePrice <= hi
    }

    if (!triggered) return

    // Mark fired before issuing the notification so a
    // double-render can't double-fire.
    const dedupe = readFired()
    if (!dedupe.includes(analysis.generatedAt)) {
      dedupe.push(analysis.generatedAt)
      writeFired(dedupe)
    }
    setFired(true)

    // Best-effort native notification. Browsers permission-gate
    // this; if denied or unsupported, the on-card "fired" badge
    // still updates and the trader sees it on their next glance.
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      try {
        const title = isLong ? 'NUGX — Entrée LONG armée' : 'NUGX — Entrée SHORT armée'
        const body = `Prix dans la zone ${analysis.entry} (${livePrice.toFixed(2)}$). Stop ${analysis.stop} · Objectif ${analysis.target}.`
        new Notification(title, {
          body,
          tag: `nugx-entry-${analysis.generatedAt}`,
          // Let the browser handle re-displaying if the tab is
          // backgrounded; tag dedupes if a duplicate fires.
        })
      } catch {
        // Notification constructor can throw under pinned-tab
        // restrictions; the badge in the panel still informs.
      }
    }
  }, [analysis, livePrice, fired])

  // Watcher is "armed" whenever there's an actionable analysis
  // with a parseable zone and a live price. UI uses this to
  // render the indicator.
  const armed =
    analysis !== null &&
    analysis.recommendation !== 'FLAT' &&
    parseZone(analysis.entry) !== null &&
    livePrice !== null &&
    !fired

  return { permission, armed, fired, requestPermission }
}
