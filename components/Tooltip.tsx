// Tooltip — reusable hover-only tooltip used across the dashboard.
//
// Wraps any element. The tooltip box renders ONLY while hovered
// and uses `position: fixed` with viewport-aware coordinates so:
//   1. It can never be clipped by an ancestor's overflow:hidden
//      (the strip / panel containers all clip horizontally).
//   2. It can never extend off-screen — coordinates get clamped
//      against the viewport with an 8px safety margin so hovering
//      the right-edge chip in the SignalsPanel strip still shows
//      the full content.
//   3. It is rendered via createPortal directly into document.body
//      so no ancestor stacking context (transform, filter, etc.)
//      or sibling canvas can paint above it. Without the portal,
//      hovering a SignalsPanel chip near the chart legend caused
//      the legend's EMA pills to bleed through the tooltip box —
//      the failure mode the user reported in screenshot #3.
//
// `position` controls the preferred placement relative to the
// trigger:
//   top    (default) — above, horizontally centered
//   bottom            — below, horizontally centered
//   left              — to the left, vertically centered
//   right             — to the right, vertically centered
// The clamp may shift the box from its preferred placement when
// it would otherwise leave the viewport — preferable to clipping.
//
// No pointer triangle: with viewport clamping the pointer's
// "anchored to the trigger" promise breaks down (the box can
// shift horizontally), so we drop it entirely. The tooltip's
// proximity to the trigger is enough visual coupling.

'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

const TOOLTIP_WIDTH = 240 // px — slightly wider so denser French copy reads on 2-3 lines instead of 4-5
const VIEWPORT_PADDING = 8 // px — margin from each viewport edge before clamping
const TRIGGER_GAP = 8 // px — gap between the trigger and the tooltip box

// Approximate tooltip height for clamp math. Real height varies
// with content length (one line vs three) — 80px is a generous
// upper bound that keeps short tooltips from getting clamped
// against the bottom edge unnecessarily.
const TOOLTIP_HEIGHT_ESTIMATE = 80

export default function Tooltip({
  content,
  children,
  position = 'top',
}: TooltipProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  )
  // SSR guard — createPortal needs document.body, which doesn't
  // exist on the server. Flip to true on first effect tick so
  // the portal only renders client-side.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Compute viewport-clamped coordinates whenever visibility or
  // position prop change. Re-running on every show keeps it
  // correct even if the trigger moved (e.g. after a panel
  // expanded/collapsed).
  useEffect(() => {
    if (!visible || !wrapperRef.current) {
      setCoords(null)
      return
    }

    const rect = wrapperRef.current.getBoundingClientRect()

    // Preferred coordinates per `position` prop.
    let top: number
    let left: number
    switch (position) {
      case 'bottom':
        top = rect.bottom + TRIGGER_GAP
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
        break
      case 'left':
        top = rect.top + rect.height / 2 - TOOLTIP_HEIGHT_ESTIMATE / 2
        left = rect.left - TOOLTIP_WIDTH - TRIGGER_GAP
        break
      case 'right':
        top = rect.top + rect.height / 2 - TOOLTIP_HEIGHT_ESTIMATE / 2
        left = rect.right + TRIGGER_GAP
        break
      case 'top':
      default:
        top = rect.top - TOOLTIP_HEIGHT_ESTIMATE - TRIGGER_GAP
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
        break
    }

    // Clamp to viewport with an 8px safety margin. Clamping can
    // shift the box from its preferred position — that's the
    // intentional trade-off versus clipping.
    const maxLeft = window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING
    const maxTop = window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - VIEWPORT_PADDING
    left = Math.max(VIEWPORT_PADDING, Math.min(maxLeft, left))
    top = Math.max(VIEWPORT_PADDING, Math.min(maxTop, top))

    setCoords({ top, left })
  }, [visible, position])

  // The tooltip box itself. Rendered via portal into document.body
  // so it's a top-level child of <body>, escaping any ancestor
  // stacking context. `display: block` is critical — the previous
  // version rendered as a <span> with position:fixed but no
  // explicit display, and Safari + some Chrome stacking-context
  // edge cases caused width: 220px to be ignored, so the box
  // bled horizontally across the SignalsPanel + chart legend.
  // boxSizing: border-box keeps padding inside the declared width.
  const tooltipBox = visible && coords
    ? (
        <div
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            zIndex: 9999,
            display: 'block',
            boxSizing: 'border-box',
            width: `${TOOLTIP_WIDTH}px`,
            background: '#161616',
            border: '1px solid #2a2a2a',
            padding: '8px 10px',
            fontSize: '10px',
            lineHeight: 1.5,
            color: '#c5c5c5',
            pointerEvents: 'none',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '0.01em',
            borderRadius: '3px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
            // pre-line preserves explicit \n line breaks in
            // content (e.g. multi-line tooltips that show full
            // headline + source on separate lines) while still
            // collapsing repeated whitespace and wrapping at the
            // box edge.
            whiteSpace: 'pre-line',
            wordBreak: 'normal',
            overflowWrap: 'anywhere',
          }}
        >
          {content}
        </div>
      )
    : null

  return (
    <span
      ref={wrapperRef}
      // inline-flex keeps inline-level wrapped children visually
      // unchanged; cursor:help is the conventional "more info"
      // affordance.
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        cursor: 'help',
      }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {mounted && tooltipBox && createPortal(tooltipBox, document.body)}
    </span>
  )
}
