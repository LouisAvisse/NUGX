// lib/alerts.ts — invalidation alert storage layer.
//
// When live price crosses an analysis's invalidationLevel the
// dashboard fires an alert banner so the trader doesn't keep
// acting on a thesis that's already broken. This file is the
// localStorage-backed data layer; lib/hooks/useAlerts.ts handles
// the price-monitoring + dedupe; components/AlertBanner.tsx
// renders the banner.
//
// Two severities:
//   WARNING  — price within 0.5% of invalidation
//   CRITICAL — price has crossed invalidation
//
// CLIENT-ONLY. Defensive against missing window / corrupt JSON
// (returns [] / drops writes silently).

import type { AlertSeverity, InvalidationAlert } from '@/lib/types'

const STORAGE_KEY = 'goldDashboard_alerts'

// Cap on stored alerts. Old alerts are kept for the 4H expiry
// window so the page can re-hydrate dismissed state after a
// reload; beyond 50 we trim oldest.
const MAX_ALERTS = 50

// Auto-expiry window. After 4 hours an alert is no longer
// considered "active" — even if not explicitly dismissed —
// because the underlying analysis has gone stale.
const ALERT_EXPIRY_MS = 4 * 60 * 60 * 1000

// Random id helper. Mirrors lib/history.ts + lib/journal.ts so
// the codebase has one convention for ids.
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// [SECURITY L6] Per-record schema validator. Drop entries with
// missing or wrong-typed load-bearing fields — getActiveAlerts()
// filters by triggeredAt + dismissed, both of which silently
// misbehave (NaN dates, truthy strings) on corrupted records.
const VALID_SEVERITIES = new Set(['WARNING', 'CRITICAL'])
function isValidAlert(a: unknown): a is InvalidationAlert {
  if (!a || typeof a !== 'object') return false
  const x = a as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    typeof x.triggeredAt === 'string' &&
    typeof x.severity === 'string' &&
    VALID_SEVERITIES.has(x.severity) &&
    typeof x.message === 'string' &&
    typeof x.priceAtTrigger === 'number' &&
    Number.isFinite(x.priceAtTrigger) &&
    typeof x.analysisId === 'string' &&
    typeof x.dismissed === 'boolean'
  )
}

function readAll(): InvalidationAlert[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // [SECURITY L6] Drop schema-invalid alerts so getActiveAlerts
    // doesn't compare against malformed timestamps.
    return parsed.filter(isValidAlert)
  } catch {
    return []
  }
}

function writeAll(alerts: InvalidationAlert[]): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = alerts.slice(0, MAX_ALERTS)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Quota / serialization failure — drop the write. Alerts
    // re-fire on next price-cross check anyway.
  }
}

// Create + persist a new alert. Returns the saved record.
export function createAlert(params: {
  message: string
  severity: AlertSeverity
  priceAtTrigger: number
  analysisId: string
}): InvalidationAlert {
  const alert: InvalidationAlert = {
    id: genId(),
    triggeredAt: new Date().toISOString(),
    severity: params.severity,
    message: params.message,
    priceAtTrigger: params.priceAtTrigger,
    analysisId: params.analysisId,
    dismissed: false,
  }
  const all = readAll()
  all.unshift(alert)
  writeAll(all)
  return alert
}

// All alerts, newest first. No filtering — see getActiveAlerts
// for the filtered "still actionable" subset.
export function getAlerts(): InvalidationAlert[] {
  return readAll()
    .slice()
    .sort(
      (a, b) =>
        new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
    )
}

// Mark a single alert as dismissed. Idempotent — calling on an
// already-dismissed alert is a no-op write.
export function dismissAlert(id: string): void {
  const all = readAll()
  const idx = all.findIndex((a) => a.id === id)
  if (idx < 0) return
  all[idx] = { ...all[idx], dismissed: true }
  writeAll(all)
}

// Mark every alert as dismissed. Used by the AlertBanner's
// "DISMISS ALL" affordance when the alert count exceeds the
// inline render cap.
export function dismissAll(): void {
  const all = readAll().map((a) => ({ ...a, dismissed: true }))
  writeAll(all)
}

// Active = not dismissed AND within the 4-hour expiry window.
// Alerts older than the window are silently filtered out so a
// long-stale thesis doesn't keep flashing the banner.
export function getActiveAlerts(): InvalidationAlert[] {
  const now = Date.now()
  return getAlerts().filter((a) => {
    if (a.dismissed) return false
    const age = now - new Date(a.triggeredAt).getTime()
    return age <= ALERT_EXPIRY_MS
  })
}
