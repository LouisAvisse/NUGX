// NewsFeed — bottom slot of the right column.
//
// Five-zone layout (top → bottom):
//
//   1. Header bar           NEWS | ALL HIGH BULL filter | HH:MM
//   2. Sentiment summary    bull/bear/neut dot+counts | flow verdict
//   3. Ratio bar            proportional 3-segment bar
//   4. Article list         scrollable; clickable rows with
//                             sentiment dot + impact badge + title
//   5. Footer               filtered count | REFRESH 15m
//
// Render branches for the list:
//   loading + empty   → 5 shimmer skeleton rows
//   error             → centered ⚠ + "NEWS FEED UNAVAILABLE"
//   empty (no error)  → "NO ARTICLES FOUND" hint
//   loaded            → one clickable row per article
//
// Sentiment data comes from the [#30] tagger added to /api/news.
// Skeleton + pulse keyframes live in app/globals.css.

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useNews } from '@/lib/hooks/useNews'
import { formatTime } from '@/lib/utils'
import type { ImpactLevel, NewsArticle, NewsSentiment } from '@/lib/types'

// Filter modes.
type Filter = 'ALL' | 'HIGH' | 'BULL'

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function impactBadgeStyle(impact: ImpactLevel): React.CSSProperties {
  const palette =
    impact === 'HIGH'
      ? { background: '#1a0a0a', color: '#f87171', border: '1px solid #3a1a1a' }
      : impact === 'MEDIUM'
        ? { background: '#1a1500', color: '#fbbf24', border: '1px solid #3a2e00' }
        : { background: '#0a0a0a', color: '#888888', border: '1px solid #1e1e1e' }
  return {
    ...palette,
    fontSize: '8px',
    padding: '1px 5px',
    letterSpacing: '0.1em',
    flexShrink: 0,
  }
}

// Sentiment dot color. Missing sentiment (older payloads) reads
// as NEUTRAL.
function sentimentDotColor(s: NewsSentiment | undefined): string {
  if (s === 'BULLISH') return '#4ade80'
  if (s === 'BEARISH') return '#f87171'
  return '#888888'
}

// Skeleton row — shaped like a real article so the list reserves
// the right vertical space before data lands.
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

// Centered message for error / empty states. Different glyph +
// lines per call site.
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
      {glyph && <div style={{ color: '#666666', fontSize: '20px' }}>{glyph}</div>}
      <div
        style={{
          color: '#666666',
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

// One filter chip — active state gets a bottom border + bright fg,
// inactive state is muted with no bottom border.
function FilterChip({
  label,
  value,
  current,
  onSelect,
}: {
  label: string
  value: Filter
  current: Filter
  onSelect: (v: Filter) => void
}) {
  const active = current === value
  return (
    <button
      onClick={() => onSelect(value)}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '1px solid #e5e5e5' : '1px solid transparent',
        color: active ? '#e5e5e5' : '#666666',
        fontSize: '8px',
        padding: '0 4px',
        letterSpacing: '0.08em',
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export default function NewsFeed() {
  const { articles, loading, error, lastUpdated } = useNews()
  const [hovered, setHovered] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('ALL')

  // Fade-in when articles array length changes — fires on first
  // load and any subsequent refresh that adds/removes items.
  const [fadeClass, setFadeClass] = useState('')
  useEffect(() => {
    if (articles.length === 0) return
    setFadeClass('fade-in')
    const timer = setTimeout(() => setFadeClass(''), 300)
    return () => clearTimeout(timer)
  }, [articles.length])

  // Sentiment counts derived from the full unfiltered articles[].
  // The summary + ratio bar always reflect the FULL feed even
  // when a filter is active, so the trader sees the underlying
  // distribution at a glance.
  const sentimentCounts = useMemo(() => {
    let bull = 0
    let bear = 0
    let neut = 0
    for (const a of articles) {
      if (a.sentiment === 'BULLISH') bull++
      else if (a.sentiment === 'BEARISH') bear++
      else neut++
    }
    return { bull, bear, neut, total: articles.length }
  }, [articles])

  // Flow verdict — bull > bear+1 BULLISH FLOW; bear > bull+1
  // BEARISH FLOW; everything else MIXED.
  const verdict = useMemo(() => {
    const { bull, bear } = sentimentCounts
    if (bull > bear + 1)
      return { text: 'BULLISH FLOW', color: '#4ade80' }
    if (bear > bull + 1)
      return { text: 'BEARISH FLOW', color: '#f87171' }
    return { text: 'MIXED', color: '#b0b0b0' }
  }, [sentimentCounts])

  // Apply the active filter to produce the visible list.
  const visibleArticles: NewsArticle[] = useMemo(() => {
    if (filter === 'HIGH') return articles.filter((a) => a.impact === 'HIGH')
    if (filter === 'BULL')
      return articles.filter((a) => a.sentiment === 'BULLISH')
    return articles
  }, [articles, filter])

  // Footer count + label per filter mode.
  const footerLabel =
    filter === 'HIGH'
      ? `${visibleArticles.length} HIGH IMPACT`
      : filter === 'BULL'
        ? `${visibleArticles.length} BULLISH`
        : `${articles.length} ARTICLES`

  // Pick the list body branch based on hook state + filter.
  let body: React.ReactNode
  if (loading && articles.length === 0) {
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
        primary="FLUX INDISPONIBLE"
        secondary="Nouvelle tentative dans 15 min"
      />
    )
  } else if (articles.length === 0) {
    body = (
      <CenteredMessage
        primary="AUCUN ARTICLE"
        secondary="Vérifier la requête ou les limites API"
      />
    )
  } else if (visibleArticles.length === 0) {
    // Filter excluded everything but we have articles.
    body = (
      <CenteredMessage
        primary="AUCUN RÉSULTAT"
        secondary={`Filter "${filter}" excludes every article in the current feed`}
      />
    )
  } else {
    body = visibleArticles.map((a, idx) => {
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
          {/* Top line: sentiment dot + impact badge + title;
              publishedAt on the right. Title truncates with
              ellipsis so a long headline doesn't push the time
              cell off the row. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                color: sentimentDotColor(a.sentiment),
                fontSize: '7px',
                flexShrink: 0,
              }}
            >
              ●
            </span>
            <span style={impactBadgeStyle(a.impact)}>{a.impact}</span>
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: isHovered ? '#e5e5e5' : '#b0b0b0',
                fontSize: '10px',
                lineHeight: 1.4,
              }}
            >
              {a.title}
            </span>
            <span
              style={{
                color: '#666666',
                fontSize: '9px',
                flexShrink: 0,
              }}
            >
              {formatTime(a.publishedAt)}
            </span>
          </div>
          {/* Source line — quieter, below the title. */}
          <div
            style={{
              color: '#888888',
              fontSize: '9px',
              marginTop: '3px',
            }}
          >
            {a.source}
          </div>
        </div>
      )
    })
  }

  // Ratio bar segment widths — divisor is the larger of total
  // articles or 1 so we never divide by zero on the empty state.
  const total = Math.max(1, sentimentCounts.total)
  const bullPct = (sentimentCounts.bull / total) * 100
  const neutPct = (sentimentCounts.neut / total) * 100
  const bearPct = (sentimentCounts.bear / total) * 100

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
      {/* 1. Header — NEWS label, filter chips, last-updated time. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px 6px 12px',
          borderBottom: '1px solid #222222',
          gap: '8px',
        }}
      >
        <span
          style={{
            color: '#888888',
            fontSize: '9px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >ACTUS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <FilterChip
            label="TOUS"
            value="ALL"
            current={filter}
            onSelect={setFilter}
          />
          <FilterChip
            label="HAUT"
            value="HIGH"
            current={filter}
            onSelect={setFilter}
          />
          <FilterChip
            label="HAUSSE"
            value="BULL"
            current={filter}
            onSelect={setFilter}
          />
        </div>
        <span
          style={{
            color: '#666666',
            fontSize: '9px',
            flexShrink: 0,
            marginLeft: 'auto',
          }}
        >
          {lastUpdated ? formatTime(lastUpdated.toISOString()) : '——'}
        </span>
      </div>

      {/* 2. Sentiment summary — counts on the left, flow verdict
            on the right. Both reflect the FULL articles list,
            not the filtered subset, so the trader sees the real
            distribution at a glance. */}
      <div
        style={{
          padding: '6px 12px',
          borderBottom: '1px solid #222222',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: '12px' }}>
          {/* Bullish count */}
          <div
            style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
          >
            <span style={{ color: '#4ade80', fontSize: '8px' }}>●</span>
            <span style={{ color: '#4ade80', fontSize: '9px' }}>
              {sentimentCounts.bull}
            </span>
            <span style={{ color: '#666666', fontSize: '8px' }}>HAUSSE</span>
          </div>
          {/* Bearish count */}
          <div
            style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
          >
            <span style={{ color: '#f87171', fontSize: '8px' }}>●</span>
            <span style={{ color: '#f87171', fontSize: '9px' }}>
              {sentimentCounts.bear}
            </span>
            <span style={{ color: '#666666', fontSize: '8px' }}>BAISSE</span>
          </div>
          {/* Neutral count */}
          <div
            style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
          >
            <span style={{ color: '#888888', fontSize: '8px' }}>●</span>
            <span style={{ color: '#b0b0b0', fontSize: '9px' }}>
              {sentimentCounts.neut}
            </span>
            <span style={{ color: '#666666', fontSize: '8px' }}>NEUTRE</span>
          </div>
        </div>
        <span
          style={{
            color: verdict.color,
            fontSize: '9px',
            letterSpacing: '0.08em',
          }}
        >
          {verdict.text}
        </span>
      </div>

      {/* 3. Ratio bar — proportional 3-segment colored bar. Falls
            back to a single muted bar when no articles. */}
      <div
        style={{
          padding: '0 12px 6px 12px',
          borderBottom: '1px solid #222222',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '3px',
            background: '#1e1e1e',
            borderRadius: '1px',
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {sentimentCounts.total === 0 ? (
            <div
              style={{
                flex: 1,
                background: '#1e1e1e',
              }}
            />
          ) : (
            <>
              <div
                style={{
                  width: `${bullPct}%`,
                  background: '#4ade80',
                }}
              />
              <div
                style={{
                  width: `${neutPct}%`,
                  background: '#666666',
                }}
              />
              <div
                style={{
                  width: `${bearPct}%`,
                  background: '#f87171',
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* 4. Article list. */}
      <div
        className={fadeClass}
        style={{ flex: 1, overflowY: 'auto', padding: 0 }}
      >
        {body}
      </div>

      {/* 5. Footer. Count reflects the active filter. */}
      <div
        style={{
          borderTop: '1px solid #222222',
          padding: '6px 12px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: '#666666', fontSize: '9px' }}>{footerLabel}</span>
        <span style={{ color: '#666666', fontSize: '9px' }}>MAJ 15min</span>
      </div>
    </div>
  )
}
