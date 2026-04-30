// NewsFeed — bottom slot of the right column.
//
// Three-zone vertical layout:
//   1. Header  (fixed)        NEWS label + last-updated time
//   2. List    (flex:1, scrolls internally — global webkit
//              scrollbar styles from globals.css apply)
//   3. Footer  (fixed)        article count + 15-min refresh hint
//
// The list has three rendering modes:
//   - loading   → 3 skeleton rows (deliberately mimics the shape of
//                 a real article so the panel doesn't pop in size
//                 when data lands)
//   - error     → centered "NEWS UNAVAILABLE" message
//   - loaded    → one row per article; click opens the source URL
//                 in a new tab; hover tints the row and brightens
//                 the title to #e5e5e5
//
// Data source:
//   - useNews (polls /api/news every 15 minutes) →
//     { articles, loading, error, lastUpdated }

'use client'

import { useState } from 'react'
import { useNews } from '@/lib/hooks/useNews'
import { formatTime } from '@/lib/utils'
import type { ImpactLevel } from '@/lib/types'

// Color scheme per impact level. Each badge gets a tinted bg + a
// foreground color + a hairline border that's a slightly lighter
// version of the bg. Dark by design — the badges should sit
// quietly until the trader scans for them.
function impactBadgeStyle(impact: ImpactLevel): React.CSSProperties {
  const palette =
    impact === 'HIGH'
      ? { background: '#1a0a0a', color: '#f87171', border: '1px solid #3a1a1a' }
      : impact === 'MEDIUM'
        ? { background: '#1a1500', color: '#fbbf24', border: '1px solid #3a2e00' }
        : { background: '#0a0a0a', color: '#444444', border: '1px solid #1e1e1e' }
  return {
    ...palette,
    fontSize: '8px',
    padding: '1px 5px',
    letterSpacing: '0.1em',
    flexShrink: 0,
    marginTop: '1px',
  }
}

// One loading skeleton — two stacked grey bars inside a fixed-height
// row. Rendered 3× when `loading` is true and we have no articles
// yet, so the panel reserves the right vertical space immediately.
function SkeletonRow() {
  return (
    <div
      style={{
        height: '48px',
        borderBottom: '1px solid #1a1a1a',
        padding: '10px 12px',
        background: '#161616',
      }}
    >
      <div style={{ width: '70%', height: '8px', background: '#1e1e1e' }} />
      <div
        style={{
          width: '40%',
          height: '6px',
          background: '#1a1a1a',
          marginTop: '6px',
        }}
      />
    </div>
  )
}

export default function NewsFeed() {
  const { articles, loading, error, lastUpdated } = useNews()
  // Track the index of the row currently under the cursor. Single
  // value is enough — only one row can be hovered at a time.
  const [hovered, setHovered] = useState<number | null>(null)

  // The list body switches between three rendering modes. We pick
  // a single React node and inject it inside the same scroll
  // container so the layout never reflows.
  let body: React.ReactNode

  if (loading && articles.length === 0) {
    // Initial load — show 3 skeleton rows.
    body = (
      <>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    )
  } else if (error) {
    // Error after the first attempt failed. We don't surface the
    // raw error string — useNews already converts it into a stable
    // "News unavailable" message; here we just need a centered
    // marker so the panel doesn't look broken.
    body = (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#333333',
          fontSize: '10px',
        }}
      >
        NEWS UNAVAILABLE
      </div>
    )
  } else {
    // Loaded — render every article as a clickable row.
    body = articles.map((a, idx) => {
      const isHovered = hovered === idx
      return (
        <div
          key={`${a.url}-${idx}`}
          // Hovering tints the row bg; clicking opens the source
          // URL in a new tab so the trader doesn't lose the
          // dashboard. `noopener,noreferrer` is browser-default
          // for `_blank` in modern engines, but explicit here
          // wouldn't hurt — using window.open per the spec.
          onMouseEnter={() => setHovered(idx)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => window.open(a.url, '_blank')}
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid #1a1a1a',
            cursor: 'pointer',
            background: isHovered ? '#161616' : 'transparent',
          }}
        >
          {/* Top line: impact badge (left) + publish time (right). */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <span style={impactBadgeStyle(a.impact)}>{a.impact}</span>
            <span
              style={{
                color: '#333333',
                fontSize: '9px',
                flexShrink: 0,
              }}
            >
              {formatTime(a.publishedAt)}
            </span>
          </div>

          {/* Bottom line: title + source. Title brightens on hover
              for an at-a-glance "this is what I'm pointing at" cue. */}
          <div style={{ marginTop: '4px' }}>
            <div
              style={{
                color: isHovered ? '#e5e5e5' : '#888888',
                fontSize: '10px',
                lineHeight: 1.4,
              }}
            >
              {a.title}
            </div>
            <div
              style={{
                color: '#444444',
                fontSize: '9px',
                marginTop: '3px',
              }}
            >
              {a.source}
            </div>
          </div>
        </div>
      )
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: '#111111',
        border: '1px solid #222222',
      }}
    >
      {/* 1. Header — fixed. Left: NEWS label. Right: last update or
             "——" if we have no successful fetch yet. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px 6px 12px',
          borderBottom: '1px solid #222222',
        }}
      >
        <span
          style={{
            color: '#444444',
            fontSize: '9px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          NEWS
        </span>
        <span style={{ color: '#333333', fontSize: '9px' }}>
          {lastUpdated ? formatTime(lastUpdated.toISOString()) : '——'}
        </span>
      </div>

      {/* 2. List — scrolls internally; the parent has overflow:hidden
             so the scroll bar stays inside this panel. */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 0,
        }}
      >
        {body}
      </div>

      {/* 3. Footer — fixed. Article count on the left, refresh
             cadence hint on the right. Both small and muted. */}
      <div
        style={{
          borderTop: '1px solid #222222',
          padding: '6px 12px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: '#333333', fontSize: '9px' }}>
          {articles.length} ARTICLES
        </span>
        <span style={{ color: '#333333', fontSize: '9px' }}>REFRESH 15m</span>
      </div>
    </div>
  )
}
