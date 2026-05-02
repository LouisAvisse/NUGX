// AlertBanner — fixed banner stack rendered just below the
// PriceBar when invalidation alerts are active. Two visual tiers:
//
//   CRITICAL — dark-red bg, red border, ⚠ THESIS INVALIDATED
//              label. Price has crossed the invalidation level.
//   WARNING  — amber-tinted bg, amber border, ⚠ APPROACHING
//              INVALIDATION label. Price within 0.5% of the
//              invalidation level.
//
// Banner rendering is fixed at top: 48px (the PriceBar height)
// so it doesn't push the rest of the layout down. page.tsx
// reserves space for the banner stack via a height-tracking
// callback so the middle row's content shifts down by the
// exact stack height instead of being overlaid.
//
// More than 2 alerts collapse to a "+ N MORE / DISMISS ALL"
// affordance so the screen never gets buried.

'use client'

import type { InvalidationAlert } from '@/lib/types'

interface AlertBannerProps {
  alerts: InvalidationAlert[]
  onDismiss: (id: string) => void
  onDismissAll: () => void
}

// Per-severity height — used both for the banner's own minHeight
// and for the layout-compensation math in page.tsx. Keep these
// constants in sync if you tweak padding.
export const CRITICAL_HEIGHT = 40
export const WARNING_HEIGHT = 36
export const MORE_ROW_HEIGHT = 28

// How many alerts we render inline before collapsing the rest.
const INLINE_CAP = 2

// Per-severity colour palette. Borders sit one tone darker than
// the bg so the banner reads as "panel above the chrome", not a
// glowing pill.
function severityStyles(s: InvalidationAlert['severity']): {
  background: string
  borderBottom: string
  fg: string
  label: string
} {
  if (s === 'CRITICAL') {
    return {
      background: '#2a0000',
      borderBottom: '1px solid #5a0000',
      fg: '#f87171',
      label: '⚠ THESIS INVALIDATED',
    }
  }
  return {
    background: '#1a1200',
    borderBottom: '1px solid #3a2800',
    fg: '#fbbf24',
    label: '⚠ APPROACHING INVALIDATION',
  }
}

// Format the time-since-trigger label like "12s ago" / "3m ago"
// / "1h ago". Anything over 4h shouldn't be shown — the alert
// will have auto-expired in lib/alerts.ts — but we still cap
// gracefully here.
function timeSince(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const s = Math.max(0, Math.floor(diffMs / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

export default function AlertBanner({
  alerts,
  onDismiss,
  onDismissAll,
}: AlertBannerProps) {
  if (alerts.length === 0) return null

  const visible = alerts.slice(0, INLINE_CAP)
  const overflow = alerts.length - INLINE_CAP

  return (
    <div
      data-section="alert-banner-stack"
      // Fixed, full-width, anchored below the 48px PriceBar.
      // zIndex above the chart but below modal overlays.
      style={{
        position: 'fixed',
        top: '48px',
        left: 0,
        right: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {visible.map((alert) => {
        const s = severityStyles(alert.severity)
        const minHeight =
          alert.severity === 'CRITICAL' ? CRITICAL_HEIGHT : WARNING_HEIGHT
        return (
          <div
            key={alert.id}
            // slide-down animation matches the BriefingModal /
            // JournalPanel slide-in vocabulary; keyframes live in
            // app/globals.css.
            className="alert-banner"
            style={{
              minHeight,
              background: s.background,
              borderBottom: s.borderBottom,
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                color: s.fg,
                fontSize: '10px',
                fontWeight: 500,
                letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
              }}
            >
              {s.label}
            </span>
            <span
              style={{
                color: s.fg,
                fontSize: '9px',
                flex: 1,
                lineHeight: 1.3,
              }}
            >
              {alert.message}
            </span>
            <span style={{ color: s.fg, fontSize: '9px' }}>
              ${alert.priceAtTrigger.toFixed(2)}
            </span>
            <span style={{ color: '#888888', fontSize: '8px' }}>
              {timeSince(alert.triggeredAt)}
            </span>
            <button
              type="button"
              onClick={() => onDismiss(alert.id)}
              aria-label="Dismiss alert"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#444444',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '0 2px',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.color = s.fg
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.color = '#444444'
              }}
            >
              ✕
            </button>
          </div>
        )
      })}

      {overflow > 0 && (
        <div
          className="alert-banner"
          style={{
            minHeight: MORE_ROW_HEIGHT,
            background: '#0d0d0d',
            borderBottom: '1px solid #222222',
            padding: '4px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span style={{ color: '#888888', fontSize: '9px', letterSpacing: '0.1em' }}>
            + {overflow} MORE
          </span>
          <button
            type="button"
            onClick={onDismissAll}
            className="terminal-btn"
            style={{
              background: 'transparent',
              border: '1px solid #444444',
              color: '#e5e5e5',
              fontSize: '8px',
              letterSpacing: '0.12em',
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            DISMISS ALL
          </button>
        </div>
      )}
    </div>
  )
}
