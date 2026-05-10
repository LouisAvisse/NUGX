// lib/notifications.ts — [PHASE-12.4] browser Notification API.
//
// Thin wrapper around window.Notification with three jobs:
//
//   1. requestNotificationPermission() — ask once, remember the
//      result so we don't spam the user every reload.
//   2. notify({ title, body, tag }) — fire-and-forget desktop
//      notification. tag dedupes — re-using the same tag replaces
//      the previous notification instead of stacking.
//   3. canNotify() — synchronous "is the browser ready to fire?"
//      check used by hooks to avoid silent no-ops.
//
// Browser-only (Notification doesn't exist in Node). Every helper
// guards typeof window for SSR safety.

// Cache the permission result so requestNotificationPermission()
// can short-circuit on the second call. Reset on permission flip
// via the storage event.
let cachedPermission: NotificationPermission | 'unsupported' | null = null

// Returns true if Notification is implemented and the user has
// granted permission. Synchronous — safe to gate UI on.
export function canNotify(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof Notification === 'undefined') return false
  return Notification.permission === 'granted'
}

// Returns 'granted' / 'denied' / 'default' / 'unsupported'. Async
// because the browser permission prompt is async on first call.
export async function requestNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined') return 'unsupported'
  if (typeof Notification === 'undefined') {
    cachedPermission = 'unsupported'
    return 'unsupported'
  }
  // Already granted or denied — return the cached value.
  if (Notification.permission !== 'default') {
    cachedPermission = Notification.permission
    return Notification.permission
  }
  if (cachedPermission && cachedPermission !== 'default') {
    return cachedPermission
  }
  try {
    const result = await Notification.requestPermission()
    cachedPermission = result
    return result
  } catch {
    cachedPermission = 'denied'
    return 'denied'
  }
}

// Fire one notification. tag is required so consumers think about
// dedupe (a runaway alert evaluator would otherwise spam the
// system tray on every poll). icon is optional — when present
// the OS shows it next to the title.
export interface NotifyArgs {
  title: string
  body: string
  tag: string                       // dedupe key
  icon?: string                     // e.g. '/icon-192.png'
  silent?: boolean                  // suppress the OS sound
}

export function notify(args: NotifyArgs): boolean {
  if (!canNotify()) return false
  try {
    new Notification(args.title, {
      body: args.body,
      tag: args.tag,
      icon: args.icon,
      silent: args.silent ?? false,
    })
    return true
  } catch {
    return false
  }
}
