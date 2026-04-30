// NewsFeed — bottom slot of the right column.
//
// Three-zone vertical layout (header / scrollable list / footer)
// with the list switching between four states:
//   loading + empty   → 5 shimmer skeleton rows
//   error             → centered ⚠ + "NEWS FEED UNAVAILABLE"
//   empty (no error)  → "NO ARTICLES FOUND" hint
//   loaded            → one clickable row per article
//
// Skeleton + pulse keyframes live in app/globals.css.

'use client'

import { useEffect, useState } from 'react'
import { useNews } from '@/lib/hooks/useNews'
import { formatTime } from '@/lib/utils'
import type { ImpactLevel } from '@/lib/types'

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

// One skeleton row — shaped like a real article so the list
// reserves the right vertical space before data lands.
function SkeletonRow() {
  return (
    <div
      style={{
        height: '52px',
        padding: '10px 12px',
        borderBottom: '1px solid #1a1a1a',
      }}
    >
      <div
        className="shimmer"
        style={{
          width: '75%',
          height: '8px',
          background: '#1a1a1a',
          borderRadius: '2px',
        }}
      />
      <div
        className="shimmer"
        style={{
          width: '35%',
          height: '7px',
          background: '#1a1a1a',
          borderRadius: '2px',
          marginTop: '8px',
        }}
      />
    </div>
  )
}

// Centered message used by both error and empty states. Different
// glyph + lines per call site — extracted because the wrapper
// styling is identical.
function CenteredMessage({
  glyph,
  primary,
  secondary,
}: {
  glyph?: string
  primary: string
  secondary: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '0 12px',
      }}
    >
      {glyph && (
        <div style={{ color: '#333333', fontSize: '20px' }}>{glyph}</div>
      )}
      <div
        style={{
          color: '#333333',
          fontSize: '10px',
          marginTop: glyph ? '8px' : 0,
          textAlign: 'center',
        }}
      >
        {primary}
      </div>
      <div
        style={{
          color: '#222222',
          fontSize: '9px',
          marginTop: '4px',
          textAlign: 'center',
        }}
      >
        {secondary}
      </div>
    </div>
  )
}

export default function NewsFeed() {
  const { articles, loading, error, lastUpdated } = useNews()
  const [hovered, setHovered] = useState<number | null>(null)

  // Fade-in when articles array length changes — fires on first
  // load and any subsequent refresh that adds/removes items.
  const [fadeClass, setFadeClass] = useState('')
  useEffect(() => {
    if (articles.length === 0) return
    setFadeClass('fade-in')
    const timer = setTimeout(() => setFadeClass(''), 300)
    return () => clearTimeout(timer)
  }, [articles.length])

  // Pick the right list-body branch.
  let body: React.ReactNode
  if (loading && articles.length === 0) {
    // 5 skeleton rows so the panel reserves vertical real estate
    // (was 3 — bumped per the error-states pass).
    body = (
      <>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    )
  } else if (error) {
    body = (
      <CenteredMessage
        glyph="⚠"
        primary="NEWS FEED UNAVAILABLE"
        secondary="Retrying in 15 minutes"
      />
    )
  } else if (articles.length === 0) {
    body = (
      <CenteredMessage
        primary="NO ARTICLES FOUND"
        secondary="Check query or API limits"
      />
    )
  } else {
    body = articles.map((a, idx) => {
      const isHovered = hovered === idx
      return (
        <div
          key={`${a.url}-${idx}`}
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <span style={impactBadgeStyle(a.impact)}>{a.impact}</span>
            <span style={{ color: '#333333', fontSize: '9px', flexShrink: 0 }}>
              {formatTime(a.publishedAt)}
            </span>
          </div>
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

      <div
        className={fadeClass}
        style={{ flex: 1, overflowY: 'auto', padding: 0 }}
      >
        {body}
      </div>

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
