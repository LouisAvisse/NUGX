// Tooltip — reusable hover-only tooltip used across the dashboard.
//
// Wraps any element. The wrapper is `inline-flex` so wrapping an
// inline label doesn't change its baseline alignment, and gets
// `cursor: help` to signal "hover me for context".
//
// The tooltip box renders only while hovered (mouse enter/leave
// flips a boolean — no global state, no portals). It's positioned
// absolutely off the wrapper so it never participates in layout
// flow — appearing/disappearing causes zero shift in surrounding
// content.
//
// `position` controls where the box appears relative to the
// wrapper:
//   top    (default) — above, horizontally centered
//   bottom            — below, horizontally centered
//   left              — to the left, vertically centered
//   right             — to the right, vertically centered
// Use top/bottom for narrow horizontally-laid elements (badges,
// short labels) and left/right when the element sits near the
// viewport edge so the box doesn't clip.
//
// A small triangle pointer is drawn on the box's edge facing the
// wrapper using the classic CSS-border trick (transparent
// adjacent borders + one solid border = arrow). Pointer color
// matches the box border so the seam is invisible.

'use client'

import { useState } from 'react'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

// Box position offsets — keyed by `position` prop. Each maps to
// the absolute-positioning style applied to the box.
const boxOffsets: Record<NonNullable<TooltipProps['position']>, React.CSSProperties> = {
  top: { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
  bottom: { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
  left: { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' },
  right: { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' },
}

// Triangle-pointer styles per direction. The pointer is a child
// of the box; it sits on the edge that faces the wrapper.
function pointerStyle(
  position: NonNullable<TooltipProps['position']>
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
  }
  const borderColor = '#2a2a2a' // matches the box border
  if (position === 'top') {
    return {
      ...base,
      bottom: '-4px',
      left: 'calc(50% - 4px)',
      borderLeft: '4px solid transparent',
      borderRight: '4px solid transparent',
      borderTop: `4px solid ${borderColor}`,
    }
  }
  if (position === 'bottom') {
    return {
      ...base,
      top: '-4px',
      left: 'calc(50% - 4px)',
      borderLeft: '4px solid transparent',
      borderRight: '4px solid transparent',
      borderBottom: `4px solid ${borderColor}`,
    }
  }
  if (position === 'left') {
    return {
      ...base,
      right: '-4px',
      top: 'calc(50% - 4px)',
      borderTop: '4px solid transparent',
      borderBottom: '4px solid transparent',
      borderLeft: `4px solid ${borderColor}`,
    }
  }
  // right
  return {
    ...base,
    left: '-4px',
    top: 'calc(50% - 4px)',
    borderTop: '4px solid transparent',
    borderBottom: '4px solid transparent',
    borderRight: `4px solid ${borderColor}`,
  }
}

export default function Tooltip({
  content,
  children,
  position = 'top',
}: TooltipProps) {
  const [visible, setVisible] = useState(false)

  return (
    <span
      // inline-flex keeps inline-level wrapped children visually
      // unchanged; cursor:help is the conventional "this has more
      // info" affordance.
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        cursor: 'help',
      }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          // Box: dark panel, slim border, fixed 200px width so
          // long content wraps cleanly. pointer-events:none so
          // mousing onto the box doesn't toggle visibility off
          // (the wrapper still owns the hover).
          style={{
            ...boxOffsets[position],
            position: 'absolute',
            zIndex: 200,
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            padding: '7px 10px',
            width: '200px',
            fontSize: '9px',
            lineHeight: 1.6,
            color: '#888888',
            pointerEvents: 'none',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.02em',
          }}
        >
          {content}
          <span style={pointerStyle(position)} />
        </span>
      )}
    </span>
  )
}
