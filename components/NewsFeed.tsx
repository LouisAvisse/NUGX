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
import Tooltip from '@/components/Tooltip'
import { useNews } from '@/lib/hooks/useNews'
import { formatTime } from '@/lib/utils'
import { T } from '@/lib/copy'
import type { ImpactLevel, NewsArticle, NewsSentiment } from '@/lib/types'

// Filter modes — single-select, mutually exclusive. Each maps to
// a distinct trader workflow rather than a generic
// impact-vs-sentiment axis split:
//
//   ALL     no filter — full feed
//   URGENT  HIGH-impact only — "what's moving the market RIGHT NOW"
//   BULL    bullish-sentiment only — "validate my LONG thesis"
//   BEAR    bearish-sentiment only — "validate my SHORT thesis"
//
// Replaces the previous three chips (TOUS / HAUT / HAUSSE) which
// stacked impact and sentiment filters as flat siblings — the
// HAUT/HAUSSE label collision was confusing and the row was
// asymmetric (no BAISSE counterpart). The new four chips give
// the trader a symmetric directional pair plus a single
// "urgent now" focus mode.
type Filter = 'ALL' | 'URGENT' | 'BULL' | 'BEAR'

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

// One filter chip. Per-chip palette so each filter has a distinct
// visual identity (lightning amber for URGENT, up-arrow green for
// BULL, down-arrow red for BEAR, neutral white for ALL) — no two
// share style, eliminating the previous HAUT/HAUSSE label
// collision. The live count next to each label is a load-bearing
// signal: a trader scanning the row sees "0 BAISSIERS" and knows
// the bearish thesis has no support without having to flip the
// filter.
//
// Faded count when 0 — chip is still clickable but signals empty
// at a glance.
interface FilterChipPalette {
  active: { fg: string; bg: string; border: string }
  inactive: { fg: string }
}
function FilterChip({
  label,
  glyph,
  count,
  palette,
  active,
  tooltip,
  onClick,
}: {
  label: string
  glyph?: string
  count: number
  palette: FilterChipPalette
  active: boolean
  tooltip: string
  onClick: () => void
}) {
  return (
    <Tooltip position="bottom" content={tooltip}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        style={{
          background: active ? palette.active.bg : 'transparent',
          border: active
            ? `1px solid ${palette.active.border}`
            : '1px solid transparent',
          color: active ? palette.active.fg : palette.inactive.fg,
          fontSize: '9px',
          padding: '2px 6px',
          letterSpacing: '0.08em',
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          borderRadius: '2px',
          // Slight transition on hover/active so the row feels
          // responsive without being noisy.
          transition: 'color 0.15s ease, background 0.15s ease',
        }}
      >
        {glyph && <span>{glyph}</span>}
        <span>{label}</span>
        <span
          style={{
            color: active
              ? palette.active.fg
              : count === 0
                ? '#333333'
                : '#666666',
            fontFeatureSettings: '"tnum"',
          }}
        >
          · {count}
        </span>
      </button>
    </Tooltip>
  )
}

// Per-filter palette + tooltip copy. Keeping the metadata as a
// const so the four chips render in a consistent loop.
const FILTER_META: Record<Filter, {
  label: string
  glyph?: string
  palette: FilterChipPalette
  tooltip: string
}> = {
  ALL: {
    label: 'TOUS',
    palette: {
      active: { fg: '#e5e5e5', bg: '#1a1a1a', border: '#2a2a2a' },
      inactive: { fg: '#888888' },
    },
    tooltip:
      "Affiche tous les articles du flux — aucun filtre. Idéal pour scanner le contexte général de session.",
  },
  URGENT: {
    label: 'URGENT',
    glyph: '⚡',
    palette: {
      active: { fg: '#fbbf24', bg: '#1a1500', border: '#3a2e00' },
      inactive: { fg: '#888888' },
    },
    tooltip:
      "Affiche uniquement les articles à FORT impact (Fed, CPI, NFP, FOMC, rendements, crise). Ce qui peut faire bouger l'or maintenant — à lire en priorité.",
  },
  BULL: {
    label: 'HAUSSIERS',
    glyph: '▲',
    palette: {
      active: { fg: '#4ade80', bg: '#0a1a0a', border: '#1a3a1a' },
      inactive: { fg: '#888888' },
    },
    tooltip:
      "Affiche uniquement les articles haussiers pour l'or (DXY faible, baisse de taux, demande safe-haven, géopolitique). Pour valider une thèse LONG.",
  },
  BEAR: {
    label: 'BAISSIERS',
    glyph: '▼',
    palette: {
      active: { fg: '#f87171', bg: '#1a0a0a', border: '#3a1a1a' },
      inactive: { fg: '#888888' },
    },
    tooltip:
      "Affiche uniquement les articles baissiers pour l'or (DXY fort, hausse de taux, rendements en hausse, risk-on). Pour valider une thèse SHORT.",
  },
}

// Filter chip ordering — TOUS first (default), then URGENT
// (highest workflow priority), then directional pair.
const FILTER_ORDER: Filter[] = ['ALL', 'URGENT', 'BULL', 'BEAR']

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

  // Flow verdict — bull > bear+1 FLUX HAUSSIER; bear > bull+1
  // FLUX BAISSIER; everything else MITIGÉ.
  const verdict = useMemo(() => {
    const { bull, bear } = sentimentCounts
    if (bull > bear + 1)
      return { text: T.flowBullish, color: '#4ade80' }
    if (bear > bull + 1)
      return { text: T.flowBearish, color: '#f87171' }
    return { text: T.flowMixed, color: '#b0b0b0' }
  }, [sentimentCounts])

  // Apply the active filter to produce the visible list.
  const visibleArticles: NewsArticle[] = useMemo(() => {
    if (filter === 'URGENT') return articles.filter((a) => a.impact === 'HIGH')
    if (filter === 'BULL')
      return articles.filter((a) => a.sentiment === 'BULLISH')
    if (filter === 'BEAR')
      return articles.filter((a) => a.sentiment === 'BEARISH')
    return articles
  }, [articles, filter])

  // Per-filter counts — pre-computed so each chip can render
  // its live count without a re-filter at render time. Drives
  // the "0 BAISSIERS" signal-density read.
  const filterCounts = useMemo<Record<Filter, number>>(
    () => ({
      ALL: articles.length,
      URGENT: articles.filter((a) => a.impact === 'HIGH').length,
      BULL: articles.filter((a) => a.sentiment === 'BULLISH').length,
      BEAR: articles.filter((a) => a.sentiment === 'BEARISH').length,
    }),
    [articles]
  )

  // Footer count + label per filter mode. French throughout.
  const footerLabel =
    filter === 'URGENT'
      ? `${visibleArticles.length} URGENT${visibleArticles.length > 1 ? 'S' : ''}`
      : filter === 'BULL'
        ? `${visibleArticles.length} HAUSSIER${visibleArticles.length > 1 ? 'S' : ''}`
        : filter === 'BEAR'
          ? `${visibleArticles.length} BAISSIER${visibleArticles.length > 1 ? 'S' : ''}`
          : `${articles.length} ARTICLE${articles.length > 1 ? 'S' : ''}`

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
    // Filter excluded everything but we have articles. Fully
    // French copy + suggests the recovery action.
    body = (
      <CenteredMessage
        primary="AUCUN RÉSULTAT"
        secondary={`Le filtre « ${FILTER_META[filter].label} » exclut tous les articles. Repasser sur « TOUS » pour voir le flux complet.`}
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
          onClick={() => {
            // [SECURITY M1] Defense-in-depth: even though the
            // /api/news route now drops non-http(s) URLs, gate
            // the click here too so a future refactor or direct
            // store mutation can't reintroduce a javascript:/data:
            // sink. noopener,noreferrer prevents the opened tab
            // from controlling window.opener (reverse-tabnabbing).
            if (!/^https?:\/\//i.test(a.url)) return
            window.open(a.url, '_blank', 'noopener,noreferrer')
          }}
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
      {/* 1. Header — ACTUS label + last-updated time. The filter
            row moved to its own dedicated band below so the four
            chips have horizontal room for their counts + glyphs
            without cramping the header. */}
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
        <Tooltip
          position="bottom"
          content="Flux d'actualités gold + macro agrégé via Google News (Reuters, Bloomberg, FT, KITCO, Investing.com, etc.). Tagué automatiquement par impact (Fed/CPI/NFP = HAUT) et par sentiment pour l'or (DXY/taux/géopolitique). Rafraîchi toutes les 15 minutes."
        >
          <span
            style={{
              color: '#888888',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            ACTUS
          </span>
        </Tooltip>
        <span
          style={{
            color: '#666666',
            fontSize: '9px',
            flexShrink: 0,
          }}
        >
          {lastUpdated ? formatTime(lastUpdated.toISOString()) : '——'}
        </span>
      </div>

      {/* Filter chip row — its own band so the four chips with
          glyphs + counts can breathe. Single-select, mutually
          exclusive. Each chip exposes a tooltip via FILTER_META
          explaining when to use it (URGENT for catalysts,
          HAUSSIERS for LONG validation, etc.). */}
      <div
        data-section="actus-filters"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 12px 6px 12px',
          borderBottom: '1px solid #222222',
          flexWrap: 'wrap',
        }}
      >
        {FILTER_ORDER.map((key) => {
          const meta = FILTER_META[key]
          return (
            <FilterChip
              key={key}
              label={meta.label}
              glyph={meta.glyph}
              count={filterCounts[key]}
              palette={meta.palette}
              active={filter === key}
              tooltip={meta.tooltip}
              onClick={() => setFilter(key)}
            />
          )
        })}
      </div>

      {/* 2. Sentiment summary — counts on the left, flow verdict
            on the right. Both reflect the FULL articles list,
            not the filtered subset, so the trader sees the real
            distribution at a glance. Tooltips on each cell so a
            new user immediately understands what HAUSSE/BAISSE/
            NEUTRE measure here vs the same words used elsewhere
            in the dashboard (bias, alignment chips). */}
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
          <Tooltip
            position="bottom"
            content="Nombre d'articles taggés haussiers pour l'or — DXY faible, baisse de taux, demande safe-haven, géopolitique."
          >
            <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ color: '#4ade80', fontSize: '8px' }}>●</span>
              <span style={{ color: '#4ade80', fontSize: '9px' }}>
                {sentimentCounts.bull}
              </span>
              <span style={{ color: '#666666', fontSize: '8px' }}>HAUSSE</span>
            </span>
          </Tooltip>
          <Tooltip
            position="bottom"
            content="Nombre d'articles taggés baissiers pour l'or — DXY fort, hausse de taux, rendements en hausse, risk-on."
          >
            <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ color: '#f87171', fontSize: '8px' }}>●</span>
              <span style={{ color: '#f87171', fontSize: '9px' }}>
                {sentimentCounts.bear}
              </span>
              <span style={{ color: '#666666', fontSize: '8px' }}>BAISSE</span>
            </span>
          </Tooltip>
          <Tooltip
            position="bottom"
            content="Articles sans direction nette pour l'or — production minière, actualités sectorielles, analyses sans biais directionnel."
          >
            <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ color: '#888888', fontSize: '8px' }}>●</span>
              <span style={{ color: '#b0b0b0', fontSize: '9px' }}>
                {sentimentCounts.neut}
              </span>
              <span style={{ color: '#666666', fontSize: '8px' }}>NEUTRE</span>
            </span>
          </Tooltip>
        </div>
        <Tooltip
          position="left"
          content="Verdict net du flux d'actualités. FLUX HAUSSIER quand au moins 2 articles haussiers de plus que de baissiers. FLUX BAISSIER pour l'inverse. MITIGÉ quand l'écart est ≤ 1 — direction non claire."
        >
          <span
            style={{
              color: verdict.color,
              fontSize: '9px',
              letterSpacing: '0.08em',
            }}
          >
            {verdict.text}
          </span>
        </Tooltip>
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

      {/* 5. Footer. Count reflects the active filter so the
            trader sees how many articles are visible right now
            without scrolling to the end of the list. */}
      <div
        style={{
          borderTop: '1px solid #222222',
          padding: '6px 12px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Tooltip
          position="top"
          content="Nombre d'articles dans la vue filtrée courante. Repasser sur « TOUS » pour le total complet du flux."
        >
          <span style={{ color: '#666666', fontSize: '9px' }}>{footerLabel}</span>
        </Tooltip>
        <Tooltip
          position="top"
          content="Le flux est rafraîchi automatiquement toutes les 15 minutes depuis Google News RSS."
        >
          <span style={{ color: '#666666', fontSize: '9px' }}>MAJ 15min</span>
        </Tooltip>
      </div>
    </div>
  )
}
