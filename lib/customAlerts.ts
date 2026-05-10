// lib/customAlerts.ts — [PHASE-12.4] user-defined price alerts.
//
// The dashboard already raises automatic invalidation alerts
// (lib/alerts.ts) tied to the active analysis. Custom alerts are
// user-set price triggers — "ping me when XAUUSD touches 2460" —
// independent of any open analysis.
//
// Storage: localStorage key 'goldDashboard_customAlerts' with a
// versioned wrapper so future migrations don't blow up old data.
// Trigger evaluation: the consumer hook receives the latest spot
// on every render and fires Notifications when an armed alert
// crosses its threshold.
//
// All client-side, browser-only — no server cost.

// Crossing direction. Used both as a config field on the alert and
// as the runtime check the evaluator performs.
//
//   ABOVE  — fires when price rises through the threshold
//   BELOW  — fires when price falls through the threshold
//   TOUCH  — fires on either direction (less common, kept for
//            "I just want to know when price hits this level")
export type CustomAlertDirection = 'ABOVE' | 'BELOW' | 'TOUCH'

// One user-set alert. Single-fire by default — once `firedAt` is
// set, the evaluator won't re-trigger on subsequent crosses
// unless the user explicitly re-arms via clearFired().
export interface CustomAlert {
  id: string                      // uuid — stable React key
  price: number                   // threshold in USD
  direction: CustomAlertDirection
  label: string                   // user-facing tag, e.g. "Resistance test"
  createdAt: string               // ISO 8601
  // Set to the spot price + ISO timestamp at fire time; cleared
  // when the user re-arms or deletes.
  firedAt?: string                // ISO 8601
  firedAtPrice?: number
}

// Storage envelope — versioned so future migrations have a hook.
interface StorageEnvelope {
  version: 1
  alerts: CustomAlert[]
}

const STORAGE_KEY = 'goldDashboard_customAlerts'

// Read the alerts list from localStorage. Tolerates a missing key,
// a malformed payload, or a future-version schema by returning an
// empty list.
export function loadCustomAlerts(): CustomAlert[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StorageEnvelope
    if (parsed?.version !== 1) return []
    if (!Array.isArray(parsed.alerts)) return []
    return parsed.alerts
  } catch {
    return []
  }
}

// Persist the alerts list. Called by every mutator (add / remove
// / mark fired). Silently no-ops in non-browser contexts.
export function saveCustomAlerts(alerts: CustomAlert[]): void {
  if (typeof window === 'undefined') return
  try {
    const env: StorageEnvelope = { version: 1, alerts }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(env))
  } catch {
    // Quota / private mode — ignore.
  }
}

// Add a new alert. Returns the persisted record.
export function addCustomAlert(args: {
  price: number
  direction: CustomAlertDirection
  label?: string
}): CustomAlert {
  const alert: CustomAlert = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    price: args.price,
    direction: args.direction,
    label: args.label ?? '',
    createdAt: new Date().toISOString(),
  }
  saveCustomAlerts([...loadCustomAlerts(), alert])
  return alert
}

export function removeCustomAlert(id: string): void {
  saveCustomAlerts(loadCustomAlerts().filter((a) => a.id !== id))
}

export function clearFired(id: string): void {
  saveCustomAlerts(
    loadCustomAlerts().map((a) =>
      a.id === id ? { ...a, firedAt: undefined, firedAtPrice: undefined } : a
    )
  )
}

// Internal mutator used by the hook on fire. Persists the
// firedAt timestamp so a reload doesn't re-trigger the alert.
export function markFired(id: string, price: number): void {
  const now = new Date().toISOString()
  saveCustomAlerts(
    loadCustomAlerts().map((a) =>
      a.id === id ? { ...a, firedAt: now, firedAtPrice: price } : a
    )
  )
}

// Pure evaluator — given an alert and the previous + current spot
// price, returns true if the alert should fire on this transition.
// Considered armed only when firedAt is undefined.
export function shouldFire(
  alert: CustomAlert,
  prevPrice: number,
  currPrice: number
): boolean {
  if (alert.firedAt) return false
  if (!Number.isFinite(prevPrice) || !Number.isFinite(currPrice)) return false
  if (prevPrice <= 0 || currPrice <= 0) return false
  if (alert.price <= 0) return false

  switch (alert.direction) {
    case 'ABOVE':
      return prevPrice < alert.price && currPrice >= alert.price
    case 'BELOW':
      return prevPrice > alert.price && currPrice <= alert.price
    case 'TOUCH':
      return (
        (prevPrice < alert.price && currPrice >= alert.price) ||
        (prevPrice > alert.price && currPrice <= alert.price)
      )
  }
}
