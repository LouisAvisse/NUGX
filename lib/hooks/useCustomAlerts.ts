// useCustomAlerts — [PHASE-12.4] manages user-set price alerts.
//
// Reads + writes the localStorage list, evaluates fire conditions
// against the latest spot price, and dispatches browser
// notifications when an armed alert crosses its threshold.
//
// Inputs:
//   currentPrice  — latest XAU/USD spot from useGoldPrice. Pass
//                   undefined while loading so the hook doesn't
//                   spuriously fire on price === 0.
//
// Returns:
//   alerts        — the persisted CustomAlert[] (sorted newest first)
//   add / remove / clearFired — mutators
//   notificationsEnabled — true once requestPermission() granted
//   enableNotifications  — call to prompt the user
//
// All work is client-side; no server, no cost.

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  type CustomAlert,
  type CustomAlertDirection,
  loadCustomAlerts,
  saveCustomAlerts,
  addCustomAlert,
  removeCustomAlert as removeAlert,
  clearFired as clearFiredImpl,
  markFired,
  shouldFire,
} from '@/lib/customAlerts'
import {
  canNotify,
  notify,
  requestNotificationPermission,
} from '@/lib/notifications'

// Cross-tab storage event support — when alerts are added/removed
// in another tab, refresh in this one too. Keeps the dashboard
// honest if the trader has it open in two windows.
const STORAGE_KEY = 'goldDashboard_customAlerts'

interface UseCustomAlertsReturn {
  alerts: CustomAlert[]
  add: (args: {
    price: number
    direction: CustomAlertDirection
    label?: string
  }) => void
  remove: (id: string) => void
  clearFired: (id: string) => void
  notificationsEnabled: boolean
  enableNotifications: () => Promise<void>
}

export function useCustomAlerts(currentPrice?: number): UseCustomAlertsReturn {
  const [alerts, setAlerts] = useState<CustomAlert[]>(() => loadCustomAlerts())
  const [notificationsEnabled, setNotificationsEnabled] = useState(canNotify())

  // Track the previous price for crossing detection. Initialized
  // to the first non-zero spot — avoids firing every alert at
  // mount time as price ticks up from 0.
  const prevPriceRef = useRef<number | null>(null)

  // ── Cross-tab sync ──────────────────────────────────────────
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setAlerts(loadCustomAlerts())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ── Crossing evaluator ─────────────────────────────────────
  useEffect(() => {
    if (currentPrice === undefined) return
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return

    const prev = prevPriceRef.current
    prevPriceRef.current = currentPrice

    // First valid sample — no crossing math yet, just seed prev.
    if (prev === null) return

    let touched = false
    const next = alerts.map((a) => {
      if (!shouldFire(a, prev, currentPrice)) return a
      touched = true
      // Fire desktop notification (no-op if permission not granted).
      const dirPretty =
        a.direction === 'ABOVE'
          ? 'au-dessus de'
          : a.direction === 'BELOW'
            ? 'au-dessous de'
            : 'à'
      notify({
        title: '⚡ Alerte XAU/USD',
        body:
          (a.label ? `${a.label} — ` : '') +
          `Prix ${dirPretty} $${a.price.toFixed(2)} (spot $${currentPrice.toFixed(2)})`,
        tag: `custom-alert-${a.id}`,
      })
      // Persist firedAt so a reload doesn't re-trigger.
      markFired(a.id, currentPrice)
      return {
        ...a,
        firedAt: new Date().toISOString(),
        firedAtPrice: currentPrice,
      }
    })

    if (touched) setAlerts(next)
  }, [currentPrice, alerts])

  // ── Mutators ────────────────────────────────────────────────
  const add = useCallback(
    (args: {
      price: number
      direction: CustomAlertDirection
      label?: string
    }) => {
      addCustomAlert(args)
      setAlerts(loadCustomAlerts())
    },
    []
  )

  const remove = useCallback((id: string) => {
    removeAlert(id)
    setAlerts(loadCustomAlerts())
  }, [])

  const clearFired = useCallback((id: string) => {
    clearFiredImpl(id)
    setAlerts(loadCustomAlerts())
  }, [])

  // ── Permission flow ────────────────────────────────────────
  const enableNotifications = useCallback(async () => {
    const result = await requestNotificationPermission()
    setNotificationsEnabled(result === 'granted')
  }, [])

  // Pre-load alerts once; keep state authoritative after.
  useEffect(() => {
    setAlerts(loadCustomAlerts())
  }, [])

  // Debug surface: explicit save on alerts state change is
  // unnecessary here because every mutator already persists. The
  // useEffect above syncs the state from disk. saveCustomAlerts is
  // re-exported so callers can persist after manual edits if needed.
  void saveCustomAlerts

  return {
    alerts,
    add,
    remove,
    clearFired,
    notificationsEnabled,
    enableNotifications,
  }
}
