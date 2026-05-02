// AnalysisPanel — the COPILOT trade card. Top slot of the right
// column. Visual surface for the confluence engine in
// /api/analyze ([#32] Marcus Reid persona).
//
// Render branches by hook state:
//   loading                → shimmer skeletons in every block
//   error                  → "ANALYSIS FAILED" banner + RETRY button
//   data                   → full Marcus Reid trade card
//   neither                → empty-state hint
//
// Layout (top → bottom):
//   1. Header bar          COPILOT | market condition badge | countdown
//   2. Calendar banner     (conditional — warning copy + amber/red tint)
//   3. Recommendation      LONG/SHORT/FLAT (large) + bias badge stack
//                            + entryTiming + entryType badge
//   4. Trade parameters    ENTRY/STOP/TARGET grid; R:R + HOLD row;
//                            INVALIDATION row
//   5. Confluence          score N/8 + 8-block bar + 8-signal grid
//   6. Catalyst            NOW / RISK / TRIGGER + exitPlan
//   7. Action button       RUN / RETRY / ANALYZING / CALENDAR BLOCK
//   8. Footer              LAST analysis time | TA last update time

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Tooltip from '@/components/Tooltip'
import { useAnalysis } from '@/lib/hooks/useAnalysis'
import { useEntryWatcher } from '@/lib/hooks/useEntryWatcher'
import { useGoldPrice } from '@/lib/hooks/useGoldPrice'
import { useSignals } from '@/lib/hooks/useSignals'
import { useNews } from '@/lib/hooks/useNews'
import { useTechnicals } from '@/lib/hooks/useTechnicals'
import { useCalendar } from '@/lib/hooks/useCalendar'
import { useHistory } from '@/lib/hooks/useHistory'
import { computeCalibration } from '@/lib/calibration'
import { formatDateTime, parsePrice } from '@/lib/utils'
import {
  displayBias,
  displayConfidence,
  displaySignalShort,
  T,
} from '@/lib/copy'
import { displaySetupName } from '@/lib/setups'
import { getCurrentSession } from '@/lib/session'
import type {
  AnalysisRequest,
  Bias,
  ChartLevels,
  Confidence,
  ConfidenceCalibration,
  EntryType,
  MarketCondition,
  Recommendation,
  SignalBreakdown,
} from '@/lib/types'

// ─────────────────────────────────────────────────────────────────
// Color + glyph helpers
// ─────────────────────────────────────────────────────────────────

function confidenceColor(c: Confidence): string {
  if (c === 'HIGH') return '#4ade80'
  if (c === 'MEDIUM') return '#fbbf24'
  return '#f87171'
}

function recDisplay(r: Recommendation): {
  color: string
  glyph: string
  text: string
} {
  if (r === 'LONG') return { color: '#4ade80', glyph: '▲', text: 'LONG' }
  if (r === 'SHORT') return { color: '#f87171', glyph: '▼', text: 'SHORT' }
  return { color: '#b0b0b0', glyph: '◆', text: 'FLAT' }
}

// Bias badge palette — used by the small badge in the
// recommendation block (right side).
function biasBadgeStyle(bias: Bias): React.CSSProperties {
  const palette =
    bias === 'BULLISH'
      ? { background: '#0a1a0a', color: '#4ade80', border: '1px solid #1a3a1a' }
      : bias === 'BEARISH'
        ? { background: '#1a0a0a', color: '#f87171', border: '1px solid #3a1a1a' }
        : { background: '#1a1500', color: '#fbbf24', border: '1px solid #3a2e00' }
  return {
    ...palette,
    fontSize: '9px',
    padding: '2px 8px',
    letterSpacing: '0.1em',
    textAlign: 'center',
  }
}

// Entry-type badge palette + copy (French display).
// Tooltips explain when each type is appropriate so the trader
// knows whether to fire now, fire small, or wait.
function entryTypeDisplay(t: EntryType): {
  text: string
  tooltip: string
  style: React.CSSProperties
} {
  if (t === 'IDEAL') {
    return {
      text: '● ENTRÉE IDÉALE',
      tooltip:
        "Conditions parfaites maintenant. Pour LONG : pullback vers EMA20 avec RSI 45-55 et histogramme MACD encore positif. Pour SHORT : miroir. C'est l'entrée la plus haute probabilité — tirer maintenant.",
      style: {
        background: '#0a1a0a',
        color: '#4ade80',
        border: '1px solid #1a3a1a',
      },
    }
  }
  if (t === 'AGGRESSIVE') {
    return {
      text: '◐ ENTRÉE AGRESSIVE',
      tooltip:
        "Setup en formation, l'entrée est tôt. Croisement MACD frais (BULLISH/BEARISH_CROSS sur les 2 dernières bougies) avec le prix déjà au-dessus/dessous de l'EMA20. Réduire la taille — risque-récompense moins favorable qu'une entrée idéale.",
      style: {
        background: '#1a1500',
        color: '#fbbf24',
        border: '1px solid #3a2e00',
      },
    }
  }
  return {
    text: '○ ATTENDRE SETUP',
    tooltip:
      "Le biais est clair mais les conditions d'entrée ne sont pas réunies. Cas typiques : RSI > 65 (chasing surachat) ou prix à plus d'1 ATR de l'EMA20. NE PAS entrer — attendre que le RSI se normalise ou que le prix revienne.",
    style: {
      background: '#161616',
      color: '#b0b0b0',
      border: '1px solid #2a2a2a',
    },
  }
}

// Market-condition tag — drives the small badge next to the
// COPILOTE header text. French display + per-state tooltip.
function marketConditionDisplay(c: MarketCondition): {
  text: string
  tooltip: string
  color: string
} {
  if (c === 'TRENDING_UP')
    return {
      text: '▲ TENDANCE',
      tooltip:
        "Tendance haussière claire — plus hauts plus hauts, plus bas plus hauts en 1H, EMA20 au-dessus de l'EMA50, RSI constamment au-dessus de 50. Conditions idéales pour des entrées LONG.",
      color: '#4ade80',
    }
  if (c === 'TRENDING_DOWN')
    return {
      text: '▼ TENDANCE',
      tooltip:
        "Tendance baissière claire — plus bas plus bas, plus hauts plus bas en 1H, EMA20 sous l'EMA50, RSI constamment sous 50. Conditions idéales pour des entrées SHORT.",
      color: '#f87171',
    }
  if (c === 'BREAKOUT_WATCH')
    return {
      text: '◎ BREAKOUT',
      tooltip:
        'Compression près de la médiane Bollinger, ATR en baisse — expansion de volatilité attendue. Préparer les ordres dans les deux sens, attendre le break clair avant de tirer.',
      color: '#fbbf24',
    }
  return {
    text: '◆ RANGE',
    tooltip:
      'Marché en range — prix oscille entre support/résistance, EMAs convergent, RSI autour de 50. Trades de range possibles (acheter le bas, vendre le haut) mais setups de tendance pas valides.',
    color: '#b0b0b0',
  }
}

// R:R color tier — green ≥1:2, amber ≥1:1.5, red below.
function riskRewardColor(rr: string): string {
  // Parse the second number out of "1:X.Y" — anything we can't
  // parse falls into the bottom tier.
  const m = rr.match(/^1\s*:\s*([\d.]+)/)
  if (!m) return '#f87171'
  const ratio = parseFloat(m[1])
  if (!Number.isFinite(ratio)) return '#f87171'
  if (ratio >= 2) return '#4ade80'
  if (ratio >= 1.5) return '#fbbf24'
  return '#f87171'
}

// Confluence score color tier — green ≥6, amber ≥4, red <4.
function confluenceColor(score: number): string {
  if (score >= 6) return '#4ade80'
  if (score >= 4) return '#fbbf24'
  return '#f87171'
}

// Map a single SignalBreakdown direction to its display tone.
function signalDotColor(b: Bias): string {
  if (b === 'BULLISH') return '#4ade80'
  if (b === 'BEARISH') return '#f87171'
  return '#b0b0b0'
}
// [F-37, F-44] Delegates to the centralized helper in lib/copy.ts.
// Kept as a local re-export so existing call sites don't churn.
const signalShortText = displaySignalShort

// Display-friendly label for each signal key (French).
const SIGNAL_LABELS: Record<keyof SignalBreakdown, string> = {
  trend: 'TENDANCE',
  momentum: 'MOMENTUM',
  macd: 'MACD',
  dxy: 'DXY',
  us10y: 'US 10Y',
  session: 'SESSION',
  news: 'ACTUS',
  calendar: 'CALENDRIER',
}

// Tooltip text for each of the 8 confluence signals — explains
// what the signal measures, how the dot reads, and why it
// matters for a gold trade. Shown on hover of each signal row
// label in the breakdown grid.
const SIGNAL_TOOLTIPS: Record<keyof SignalBreakdown, string> = {
  trend:
    "Aligne EMA20/50 + position du prix. Le copilote score le signal HAUSSE / BAISSE / NEUTRE selon que la structure 1H supporte le biais — trader DANS le sens de la tendance pour un meilleur ratio.",
  momentum:
    "RSI(14). Vert quand le RSI accompagne le biais (>50 hausse, <50 baisse). Rouge à l'inverse. Neutre si RSI 45-55 — pas d'élan directionnel.",
  macd:
    "Histogramme MACD. Positif et croissant = momentum haussier. Négatif et croissant = baissier. Un croisement frais (BULLISH/BEARISH_CROSS sur les 2 dernières bougies) est un des signaux d'entrée les plus forts pour l'or.",
  dxy:
    "Direction du Dollar Index. Or et DXY sont inversement corrélés : DXY en baisse = HAUSSIER pour l'or. DXY en hausse = BAISSIER. Un des signaux macro les plus fiables.",
  us10y:
    "Direction du rendement Treasury 10 ans. Rendements en hausse = BAISSIER pour l'or (l'or ne paie pas d'intérêt, donc les obligations deviennent plus attractives). Rendements en baisse = HAUSSIER.",
  session:
    "Qualité de la session courante. Overlap NY/Londres (12-16 UTC) = signal le plus fort. Hors-session = neutre/à éviter.",
  news:
    "Sentiment global des dernières actualités. Compte les titres haussiers vs baissiers du flux récent. Plus de hausses que de baisses → signal HAUSSE.",
  calendar:
    "Calendrier économique dégagé pour trader ? HAUSSE = aucun événement à fort impact dans les 45 prochaines minutes. BAISSE = événement imminent, éviter toute nouvelle entrée.",
}

// Iteration order for the 8-signal grid.
const SIGNAL_ORDER: (keyof SignalBreakdown)[] = [
  'trend',
  'momentum',
  'macd',
  'dxy',
  'us10y',
  'session',
  'news',
  'calendar',
]

// Format secondsUntilNext → "MM:SS" (zero-padded).
function formatCountdown(seconds: number): string {
  const s = Math.max(0, seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// Parse the "NOW: ... RISK: ... TRIGGER: ..." catalyst format
// into three labeled lines. Falls back gracefully if the model
// deviates from the format (returns the whole catalyst as `now`).
//
// Uses [\s\S] instead of the `s` (dotAll) regex flag so we don't
// need to bump tsconfig target to ES2018 — same matching
// behavior, broader compatibility.
function parseCatalyst(catalyst: string): {
  now: string
  risk: string
  trigger: string
} {
  const nowMatch = catalyst.match(/NOW:\s*([\s\S]+?)(?=\s*RISK:|$)/)
  const riskMatch = catalyst.match(/RISK:\s*([\s\S]+?)(?=\s*TRIGGER:|$)/)
  const triggerMatch = catalyst.match(/TRIGGER:\s*([\s\S]+?)$/)
  return {
    now: nowMatch?.[1]?.trim() ?? catalyst,
    risk: riskMatch?.[1]?.trim() ?? '——',
    trigger: triggerMatch?.[1]?.trim() ?? '——',
  }
}

// Shared label tone — tiny uppercase muted labels.
const labelStyle: React.CSSProperties = {
  color: '#888888',
  fontSize: '8px',
  textTransform: 'uppercase',
}

// Reusable shimmer bar.
function Skeleton({
  width,
  height,
  widthPct,
}: {
  width?: number
  height: number
  widthPct?: string
}) {
  return (
    <div
      className="shimmer"
      style={{
        width: widthPct ?? `${width}px`,
        height: `${height}px`,
        background: '#1a1a1a',
        borderRadius: '2px',
      }}
    />
  )
}

// One trade-parameter cell (entry / stop / target / etc).
// `tooltip` is required — these are the most decision-critical
// fields in the panel and the trader needs to know what each
// one means before risking capital on it.
function ParamCell({
  label,
  value,
  color,
  loading,
  tooltip,
}: {
  label: string
  value: string | undefined
  color: string
  loading: boolean
  tooltip: string
}) {
  return (
    <div data-param={label}>
      <Tooltip position="left" content={tooltip}>
        <div style={labelStyle}>{label}</div>
      </Tooltip>
      {loading ? (
        <div style={{ marginTop: '2px' }}>
          <Skeleton width={55} height={11} />
        </div>
      ) : (
        <div
          style={{
            color: value ? color : '#666666',
            fontSize: '11px',
            fontWeight: 500,
            marginTop: '2px',
          }}
        >
          {value ?? '——'}
        </div>
      )}
    </div>
  )
}

// [PHASE-3] Alt-scenario disclosure row.
//
// Renders a small expandable row beneath the primary trade
// parameters. Collapsed shows just "SCÉNARIO ALT" + the
// recommendation chip; expanded shows the trigger sentence and a
// compact entry/stop/target line.
//
// Visual posture: deliberately less prominent than the primary
// params row (smaller font, muted background) so the primary
// trade reads first. Same blue/red/green semantic palette so the
// trader's eye reads "this is the other side" without confusion.
function AltScenarioRow({
  scenario,
}: {
  scenario: import('@/lib/types').AltScenario
}) {
  const [expanded, setExpanded] = useState(false)
  const recColor =
    scenario.recommendation === 'LONG'
      ? '#4ade80'
      : scenario.recommendation === 'SHORT'
        ? '#f87171'
        : '#b0b0b0'
  const recGlyph =
    scenario.recommendation === 'LONG'
      ? '▲'
      : scenario.recommendation === 'SHORT'
        ? '▼'
        : '◆'
  return (
    <div
      data-section="alt-scenario"
      style={{
        marginTop: '8px',
        background: '#161616',
        border: '1px solid #222222',
        borderRadius: '2px',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          color: '#b0b0b0',
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          letterSpacing: '0.1em',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#666666', fontSize: '8px' }}>
            {expanded ? '▾' : '▸'}
          </span>
          <span style={{ color: '#888888' }}>SCÉNARIO ALT</span>
          <span
            style={{
              color: recColor,
              fontSize: '9px',
              fontWeight: 500,
            }}
          >
            {recGlyph} {scenario.recommendation}
          </span>
        </span>
        <span style={{ color: '#666666', fontSize: '8px' }}>
          {expanded ? 'MASQUER' : 'AFFICHER'}
        </span>
      </button>
      {expanded ? (
        <div
          style={{
            padding: '0 10px 10px 10px',
            borderTop: '1px solid #1a1a1a',
            paddingTop: '8px',
          }}
        >
          {/* Trigger sentence — describes what price action
              activates this branch. */}
          <div
            style={{
              color: '#e5e5e5',
              fontSize: '10px',
              lineHeight: 1.5,
              marginBottom: '8px',
            }}
          >
            <span style={{ color: '#888888', marginRight: '4px' }}>
              DÉCLENCHEUR :
            </span>
            {scenario.trigger}
          </div>
          {/* Compact entry/stop/target row — same color
              semantics as the primary trade params. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '6px',
              marginBottom: '6px',
            }}
          >
            <div>
              <div style={{ ...labelStyle, fontSize: '7px' }}>ENTRÉE</div>
              <div
                style={{
                  color: '#60a5fa',
                  fontSize: '10px',
                  fontWeight: 500,
                  marginTop: '1px',
                }}
              >
                {scenario.entry}
              </div>
            </div>
            <div>
              <div style={{ ...labelStyle, fontSize: '7px' }}>STOP</div>
              <div
                style={{
                  color: '#f87171',
                  fontSize: '10px',
                  fontWeight: 500,
                  marginTop: '1px',
                }}
              >
                {scenario.stop}
              </div>
            </div>
            <div>
              <div style={{ ...labelStyle, fontSize: '7px' }}>OBJECTIF</div>
              <div
                style={{
                  color: '#4ade80',
                  fontSize: '10px',
                  fontWeight: 500,
                  marginTop: '1px',
                }}
              >
                {scenario.target}
              </div>
            </div>
          </div>
          <div
            style={{
              color: '#888888',
              fontSize: '9px',
              lineHeight: 1.5,
            }}
          >
            {scenario.rationale}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// One row in the 8-signal grid. The label is wrapped in a
// Tooltip so the trader can hover any of the 8 signals to read
// what it measures and how to interpret the dot color.
function SignalRow({
  label,
  bias,
  loading,
  tooltip,
}: {
  label: string
  bias: Bias | undefined
  loading: boolean
  tooltip: string
}) {
  return (
    <div
      data-signal={label}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Tooltip position="left" content={tooltip}>
        <span style={{ ...labelStyle, fontSize: '8px' }}>{label}</span>
      </Tooltip>
      {loading || !bias ? (
        <span style={{ color: '#666666', fontSize: '8px' }}>——</span>
      ) : (
        <span style={{ color: signalDotColor(bias), fontSize: '8px' }}>
          ● {signalShortText(bias)}
        </span>
      )}
    </div>
  )
}

// [SPRINT-7] Assemble the personalPatterns slice of the analyze
// request. Pulled out of buildRequest so the try/catch is local
// — any failure inside (malformed PersonalPatterns shape, missing
// bucket key, anything thrown) collapses to hasData=false, which
// the system prompt tells Claude to ignore. Keeps the analysis
// flow resilient to history-storage corruption.
function buildPersonalPatterns(
  patternsData: import('@/lib/types').PersonalPatterns | null,
  currentSession: string,
  lastConfluenceScore: number | undefined
): import('@/lib/types').AnalysisRequest['personalPatterns'] {
  try {
    const sessionStats = patternsData?.bySession[currentSession]
    const confluenceStats =
      lastConfluenceScore !== undefined
        ? patternsData?.byConfluenceScore[lastConfluenceScore]
        : undefined
    return {
      hasData: (patternsData?.totalWithOutcome ?? 0) >= 5,
      totalOutcomes: patternsData?.totalWithOutcome ?? 0,
      overallAccuracy: patternsData?.overallAccuracy ?? 0,
      bestSession: patternsData?.bestSession ?? null,
      bestConfluenceThreshold: patternsData?.bestConfluenceThreshold ?? null,
      currentSessionAccuracy: sessionStats?.accuracy ?? null,
      currentConfluenceAccuracy: confluenceStats?.accuracy ?? null,
      insight: patternsData?.insight ?? '',
    }
  } catch {
    return {
      hasData: false,
      totalOutcomes: 0,
      overallAccuracy: 0,
      bestSession: null,
      bestConfluenceThreshold: null,
      currentSessionAccuracy: null,
      currentConfluenceAccuracy: null,
      insight: '',
    }
  }
}

// [SPRINT-12] Local helper now delegates to the shared parsePrice
// in lib/utils. Returns undefined (not 0) when there's nothing to
// render — chart consumers want the level skipped entirely rather
// than drawn at $0. Keeping this thin wrapper avoids cascading
// changes through every call site.
function parseFirstNumber(s: string | undefined): number | undefined {
  const n = parsePrice(s)
  return n > 0 ? n : undefined
}

// [SPRINT-11] Calibration breakdown — three confidence-level
// rows + an optional insight line below. Extracted out of the
// main component to keep the JSX readable.
function CalibrationRows({
  calibration,
}: {
  calibration: ConfidenceCalibration
}) {
  // Per-level palette — same green/amber/red as the main
  // confidence badge so the UI vocabulary stays consistent.
  const rows: {
    label: Confidence
    accuracy: number | null
    badge: { bg: string; fg: string }
    count: number
  }[] = [
    {
      label: 'HIGH',
      accuracy: calibration.highConfidenceAccuracy,
      badge: { bg: '#0a1a0a', fg: '#4ade80' },
      count: 0,
    },
    {
      label: 'MEDIUM',
      accuracy: calibration.mediumConfidenceAccuracy,
      badge: { bg: '#1a1500', fg: '#fbbf24' },
      count: 0,
    },
    {
      label: 'LOW',
      accuracy: calibration.lowConfidenceAccuracy,
      badge: { bg: '#1a0a0a', fg: '#f87171' },
      count: 0,
    },
  ]

  const allNull = rows.every((r) => r.accuracy === null)

  return (
    <>
      {rows.map((row) => {
        const fillColor =
          row.accuracy === null
            ? '#1e1e1e'
            : row.accuracy >= 65
              ? '#4ade80'
              : row.accuracy >= 50
                ? '#fbbf24'
                : '#f87171'
        return (
          <div
            key={row.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                background: row.badge.bg,
                color: row.badge.fg,
                fontSize: '8px',
                padding: '2px 6px',
                width: '60px',
                textAlign: 'center',
                letterSpacing: '0.08em',
              }}
            >
              {displayConfidence(row.label)}
            </span>
            <div
              style={{
                flex: 1,
                height: '4px',
                background: '#1e1e1e',
                borderRadius: '1px',
              }}
            >
              <div
                style={{
                  width: row.accuracy === null ? '0%' : `${row.accuracy}%`,
                  height: '4px',
                  background: fillColor,
                  borderRadius: '1px',
                }}
              />
            </div>
            <span
              style={{
                width: '35px',
                textAlign: 'right',
                color: row.accuracy === null ? '#333333' : fillColor,
                fontSize: '10px',
              }}
            >
              {row.accuracy === null ? '——' : `${row.accuracy}%`}
            </span>
          </div>
        )
      })}

      {/* Calibration insight — branches per the spec, French copy. */}
      {(() => {
        const high = calibration.highConfidenceAccuracy
        const med = calibration.mediumConfidenceAccuracy
        if (allNull) {
          return (
            <div style={{ color: '#333333', fontSize: '9px', marginTop: '8px' }}>
              {T.calibrationInsightAllNull}
            </div>
          )
        }
        if (high !== null && high < 50) {
          return (
            <div
              style={{
                color: '#f87171',
                fontSize: '9px',
                marginTop: '8px',
                lineHeight: 1.4,
              }}
            >
              {T.calibrationInsightHighLow}
            </div>
          )
        }
        if (high !== null && med !== null && high < med) {
          return (
            <div
              style={{
                color: '#fbbf24',
                fontSize: '9px',
                marginTop: '8px',
                lineHeight: 1.4,
              }}
            >
              {T.calibrationInsightHighUnderMedium}
            </div>
          )
        }
        if (high !== null && med !== null && high >= med) {
          return (
            <div style={{ color: '#4ade80', fontSize: '9px', marginTop: '8px' }}>
              {T.calibrationInsightOk}
            </div>
          )
        }
        return null
      })()}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

interface AnalysisPanelProps {
  // Optional — page.tsx passes a setter so the GoldChart can
  // overlay the AI's entry/stop/target/resistance/support as
  // horizontal price lines after every successful analysis run.
  // swingHigh/swingLow piggyback off the technicals hook so the
  // chart shows recent structure even before the first analysis.
  onLevelsUpdate?: (levels: ChartLevels) => void

  // [SPRINT-8] Called after every successful analysis result
  // arrives. page.tsx uses this to lift the AnalysisResult into
  // a top-level state slot so the invalidation-alert hook can
  // watch it. Optional — the panel works fine without it for any
  // future caller that doesn't need alerts.
  onAnalysisComplete?: (result: import('@/lib/types').AnalysisResult) => void
}

export default function AnalysisPanel({
  onLevelsUpdate,
  onAnalysisComplete,
}: AnalysisPanelProps = {}) {
  const analysis = useAnalysis()
  const goldPrice = useGoldPrice()
  const signals = useSignals()
  const news = useNews()
  const technicals = useTechnicals()
  const calendar = useCalendar()
  // [SPRINT-5] Persist every successful analysis to localStorage
  // history; the hook also runs the path-replay outcome checker
  // in the background so we don't need to manage that here.
  const history = useHistory()
  const { data, loading, error, secondsUntilNext, trigger } = analysis

  // [PHASE-4] Watch the live price against the analysis entry
  // zone; fires a browser notification the moment price enters
  // the zone in the expected direction. Reads goldPrice.data
  // (already polled every 30s) so no new network traffic.
  const watcher = useEntryWatcher(
    data ?? null,
    goldPrice.data?.price ?? null
  )

  const [hoverBtn, setHoverBtn] = useState(false)

  // Fade-in on every fresh analysis result.
  const [fadeClass, setFadeClass] = useState('')
  useEffect(() => {
    if (!data) return
    setFadeClass('fade-in')
    const timer = setTimeout(() => setFadeClass(''), 300)
    return () => clearTimeout(timer)
  }, [data?.generatedAt])

  // Push the parsed AI levels up to page.tsx → GoldChart. Fires
  // on every fresh `data.generatedAt` (i.e. every successful
  // analysis), and also re-fires when the technicals indicators
  // refresh so swingHigh/swingLow stay in sync with the latest
  // 20-candle structure.
  useEffect(() => {
    if (!onLevelsUpdate) return
    if (!data) return
    onLevelsUpdate({
      entry: parseFirstNumber(data.entry),
      stop: parseFirstNumber(data.stop),
      target: parseFirstNumber(data.target),
      resistance: parseFirstNumber(data.resistance),
      support: parseFirstNumber(data.support),
      swingHigh: technicals.indicators?.swingHigh,
      swingLow: technicals.indicators?.swingLow,
    })
  }, [
    data?.generatedAt,
    data,
    technicals.indicators,
    onLevelsUpdate,
  ])

  // [SPRINT-11] Confidence calibration. Recomputed on mount,
  // whenever a fresh analysis lands (data?.generatedAt changes),
  // and whenever history mutates (the historyUpdated event fires
  // through useHistory which we already subscribe to). The
  // calibration card only renders fully when isCalibrated is true
  // (>= 10 decided outcomes).
  const [calibration, setCalibration] = useState<ConfidenceCalibration | null>(
    null
  )
  useEffect(() => {
    setCalibration(computeCalibration())
  }, [data?.generatedAt, history.history])

  // [SPRINT-5] Persist each successful analysis to localStorage
  // history. Keyed off generatedAt so we save once per unique
  // run; useHistory dedupes downstream too (a duplicate save with
  // the same generatedAt would create a new record id, but in
  // practice this effect only fires when the analyze hook returns
  // fresh data).
  const lastSavedAt = useRef<string | null>(null)
  useEffect(() => {
    if (!data) return
    if (lastSavedAt.current === data.generatedAt) return
    lastSavedAt.current = data.generatedAt
    const session = getCurrentSession().name
    const price = goldPrice.data?.price ?? 0
    history.saveAnalysis(data, price, session)
    // [SPRINT-8] Lift the result up to page.tsx so useAlerts can
    // watch invalidationLevel for crosses. Fires once per unique
    // generatedAt thanks to the same dedupe ref above.
    onAnalysisComplete?.(data)
  }, [data, goldPrice.data, history, onAnalysisComplete])

  // Build the analyze payload from current upstream state.
  const buildRequest = useCallback((): AnalysisRequest => {
    const session = getCurrentSession()
    const articles = news.articles
    const newsBullishCount = articles.filter(
      (a) => a.sentiment === 'BULLISH'
    ).length
    const newsBearishCount = articles.filter(
      (a) => a.sentiment === 'BEARISH'
    ).length
    const newsNeutralCount =
      articles.length - newsBullishCount - newsBearishCount

    const ind = technicals.indicators

    return {
      price: goldPrice.data?.price ?? 0,
      changePct: goldPrice.data?.changePct ?? 0,
      high: goldPrice.data?.high ?? 0,
      low: goldPrice.data?.low ?? 0,
      open: goldPrice.data?.open ?? 0,
      ema20: ind?.ema20 ?? 0,
      ema50: ind?.ema50 ?? 0,
      ema200: ind?.ema200 ?? 0,
      rsi: ind?.rsi ?? 50,
      macd: ind?.macd ?? 0,
      macdSignal: ind?.macdSignal ?? 0,
      macdHistogram: ind?.macdHistogram ?? 0,
      macdCross: ind?.macdCross ?? 'NONE',
      atr: ind?.atr ?? 0,
      bbUpper: ind?.bbUpper ?? 0,
      bbLower: ind?.bbLower ?? 0,
      swingHigh: ind?.swingHigh ?? 0,
      swingLow: ind?.swingLow ?? 0,
      trend: ind?.trend ?? 'RANGING',
      rsiZone: ind?.rsiZone ?? 'NEUTRAL',
      dayRangePct: ind?.dayRangePct ?? 50,
      priceVsEma20: ind?.priceVsEma20 ?? 'ABOVE',
      priceVsEma50: ind?.priceVsEma50 ?? 'ABOVE',
      priceVsEma200: ind?.priceVsEma200 ?? 'ABOVE',
      dxy: signals.data?.dxy.price ?? 0,
      dxyChangePct: signals.data?.dxy.changePct ?? 0,
      us10y: signals.data?.us10y.price ?? 0,
      us10yChangePct: signals.data?.us10y.changePct ?? 0,
      session: session.name,
      sessionIsHighVolatility: session.isHighVolatility,
      clearToTrade: calendar.data?.clearToTrade ?? true,
      warningMessage: calendar.data?.warningMessage ?? null,
      nextEventTitle: calendar.data?.nextHighImpact?.title ?? null,
      nextEventMinutes:
        calendar.data?.nextHighImpact?.minutesUntil ?? null,
      newsBullishCount,
      newsBearishCount,
      newsNeutralCount,
      topHeadlines: articles.slice(0, 6).map((a) => a.title),

      // [SPRINT-4] Multi-timeframe context. Pulled from the same
      // useTechnicals hook that drives the chart's TF switcher —
      // the per-TF bundles carry compact scalar reads (trend, RSI
      // + zone, MACD histogram + cross, EMA20/50). priceVsEma20
      // is computed inline from the live spot vs the per-TF EMA20
      // since the per-TF bundle doesn't carry that flag itself.
      tf15m: {
        trend: technicals.tf15m?.indicators.trend ?? 'RANGING',
        rsi: technicals.tf15m?.indicators.rsi ?? 50,
        rsiZone: technicals.tf15m?.indicators.rsiZone ?? 'NEUTRAL',
        macdHistogram: technicals.tf15m?.indicators.macdHistogram ?? 0,
        macdCross: technicals.tf15m?.indicators.macdCross ?? 'NONE',
        ema20: technicals.tf15m?.indicators.ema20 ?? 0,
        ema50: technicals.tf15m?.indicators.ema50 ?? 0,
        priceVsEma20:
          (goldPrice.data?.price ?? 0) >= (technicals.tf15m?.indicators.ema20 ?? 0)
            ? 'ABOVE'
            : 'BELOW',
      },
      tf4h: {
        trend: technicals.tf4h?.indicators.trend ?? 'RANGING',
        rsi: technicals.tf4h?.indicators.rsi ?? 50,
        rsiZone: technicals.tf4h?.indicators.rsiZone ?? 'NEUTRAL',
        macdHistogram: technicals.tf4h?.indicators.macdHistogram ?? 0,
        macdCross: technicals.tf4h?.indicators.macdCross ?? 'NONE',
        ema20: technicals.tf4h?.indicators.ema20 ?? 0,
        ema50: technicals.tf4h?.indicators.ema50 ?? 0,
        priceVsEma20:
          (goldPrice.data?.price ?? 0) >= (technicals.tf4h?.indicators.ema20 ?? 0)
            ? 'ABOVE'
            : 'BELOW',
      },

      // Detected patterns ride along on the analyze request. The
      // route's user message has a dedicated DETECTED PATTERNS
      // section that lists each one; if the array is empty the
      // section reads "No significant patterns detected".
      detectedPatterns: technicals.patterns ?? [],

      // [SPRINT-7] Personal performance context. Pulled from the
      // useHistory hook's PersonalPatterns aggregate. Wrapped in
      // try/catch (via buildPersonalPatterns below) so a malformed
      // history record never blocks an analysis run — fallback
      // is hasData=false, which the system prompt tells Claude
      // to ignore.
      personalPatterns: buildPersonalPatterns(
        history.patterns,
        session.name,
        data?.confluenceScore
      ),
    }
  }, [
    goldPrice.data,
    signals.data,
    news.articles,
    technicals.indicators,
    technicals.tf15m,
    technicals.tf4h,
    technicals.patterns,
    calendar.data,
    history.patterns,
    data?.confluenceScore,
  ])

  // Auto-trigger ONCE on mount, as soon as the price hook has
  // its first reading. Pre-populates the Copilot card without
  // requiring a user click — useful for client previews where
  // the dashboard should look "live" the moment it loads.
  // Subsequent runs go through the manual button or R shortcut
  // (the countdown hook never reaches 0 in practice; the auto-
  // trigger effect below stays in place for symmetry).
  const hasAutoTriggered = useRef(false)
  useEffect(() => {
    if (hasAutoTriggered.current) return
    if (!goldPrice.data) return
    if (calendar.data?.clearToTrade === false) return
    hasAutoTriggered.current = true
    trigger(buildRequest())
  }, [goldPrice.data, calendar.data, trigger, buildRequest])

  // Auto-trigger when the countdown wraps.
  useEffect(() => {
    if (secondsUntilNext === 0 && goldPrice.data) {
      trigger(buildRequest())
    }
  }, [secondsUntilNext, goldPrice.data, buildRequest, trigger])

  // Keyboard shortcut bridge: page.tsx dispatches a
  // 'triggerAnalysis' CustomEvent on R/r. Listen here and fire
  // the same path the RUN ANALYSIS button takes — respecting
  // loading + calendar gate so a stale R-press during a
  // blocked window can't sneak through.
  useEffect(() => {
    function handleTrigger() {
      if (loading) return
      if (calendar.data?.clearToTrade === false) return
      if (!goldPrice.data) return
      trigger(buildRequest())
    }
    window.addEventListener('triggerAnalysis', handleTrigger)
    return () => window.removeEventListener('triggerAnalysis', handleTrigger)
  }, [loading, calendar.data, goldPrice.data, trigger, buildRequest])

  // Calendar gate — when blocked, the panel disables the analyze
  // button entirely with a clear "calendar block" message.
  const calendarBlocked =
    calendar.data?.clearToTrade === false && !loading

  const onClickRun = () => {
    if (loading || calendarBlocked) return
    trigger(buildRequest())
  }

  // Header right node — three states.
  let countdownNode: React.ReactNode
  if (loading) {
    countdownNode = (
      <span className="pulse" style={{ color: '#fbbf24', fontSize: '9px' }}>ANALYSE...</span>
    )
  } else if (data) {
    countdownNode = (
      <span style={{ color: '#666666', fontSize: '9px' }}>
        {formatCountdown(secondsUntilNext)}
      </span>
    )
  } else {
    countdownNode = (
      <span style={{ color: '#666666', fontSize: '9px' }}>——</span>
    )
  }

  const showSkeleton = loading
  const showError = !loading && !!error
  const rec = data ? recDisplay(data.recommendation) : null
  const mc = data ? marketConditionDisplay(data.marketCondition) : null
  const et = data ? entryTypeDisplay(data.entryType) : null
  const cat = data ? parseCatalyst(data.catalyst) : null

  // Calendar warning banner styling — two tiers.
  const warningCopy = calendar.data?.warningMessage ?? null
  const warningHard = calendar.data?.clearToTrade === false
  const warningStyle: React.CSSProperties | null = warningCopy
    ? warningHard
      ? {
          background: '#1a0000',
          borderBottom: '1px solid #3a0000',
          color: '#f87171',
        }
      : {
          background: '#1a0e00',
          borderBottom: '1px solid #3a2200',
          color: '#fbbf24',
        }
    : null

  return (
    <div
      style={{
        background: '#111111',
        border: '1px solid #222222',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* 1. Header. */}
      <div
        data-section="copilot-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px 6px 12px',
          borderBottom: '1px solid #222222',
          gap: '8px',
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Tooltip
            position="left"
            content="Copilote IA Marcus Reid — analyse 8 facteurs de confluence (tendance, momentum, MACD, DXY, US10Y, session, actus, calendrier) pour générer une thèse de trade structurée. Auto-rafraîchissement toutes les 30 minutes ou à la demande (touche R)."
          >
            <span
              style={{
                color: '#888888',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              COPILOTE
            </span>
          </Tooltip>
          {mc && (
            <Tooltip position="bottom" content={mc.tooltip}>
              <span
                style={{
                  color: mc.color,
                  fontSize: '8px',
                  letterSpacing: '0.08em',
                }}
              >
                {mc.text}
              </span>
            </Tooltip>
          )}
          {/* [PHASE-4] Watcher status — only renders when there's
              an actionable analysis. Three states:
                - armed:   light blue; price not yet in zone.
                - fired:   green; price entered the zone, alert sent.
                - default: grey link to enable notifications.
              The button-style state lets the trader request
              notification permission with a single click. */}
          {data && data.recommendation !== 'FLAT' ? (
            watcher.permission === 'granted' ? (
              <Tooltip
                position="bottom"
                content={
                  watcher.fired
                    ? "Le prix est entré dans la zone d'entrée. Notification déclenchée."
                    : watcher.armed
                      ? "Le copilote surveille le prix en continu et déclenchera une notification dès qu'il entrera dans la zone d'entrée."
                      : 'Surveillance suspendue (analyse incompatible ou prix indisponible).'
                }
              >
                <span
                  style={{
                    color: watcher.fired
                      ? '#4ade80'
                      : watcher.armed
                        ? '#60a5fa'
                        : '#666666',
                    fontSize: '8px',
                    letterSpacing: '0.08em',
                  }}
                >
                  {watcher.fired
                    ? '✓ ZONE ATTEINTE'
                    : watcher.armed
                      ? '◉ EN SURVEILLANCE'
                      : '○ EN ATTENTE'}
                </span>
              </Tooltip>
            ) : watcher.permission === 'default' ? (
              <Tooltip
                position="bottom"
                content="Activer les notifications du navigateur pour être alerté dès que le prix entre dans la zone d'entrée — sans avoir à surveiller le tableau de bord en continu."
              >
                <button
                  type="button"
                  onClick={() => void watcher.requestPermission()}
                  style={{
                    background: 'transparent',
                    border: '1px solid #222222',
                    borderRadius: '2px',
                    color: '#888888',
                    fontSize: '8px',
                    letterSpacing: '0.08em',
                    padding: '1px 6px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  ◉ ACTIVER ALERTES
                </button>
              </Tooltip>
            ) : null
          ) : null}
        </div>
        {countdownNode}
      </div>

      {/* 2. Calendar warning banner — conditional. */}
      {warningCopy && warningStyle && (
        <div
          style={{
            ...warningStyle,
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '10px' }}>⚠</span>
          <span style={{ fontSize: '9px', lineHeight: 1.4 }}>
            {warningCopy}
          </span>
        </div>
      )}

      {/* 3. Recommendation block — the focal element. */}
      <div
        data-section="recommendation"
        className={fadeClass}
        style={{
          padding: '12px 12px 10px 12px',
          borderBottom: '1px solid #222222',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Left: large recommendation glyph + word. */}
          {showSkeleton ? (
            <Skeleton width={140} height={28} />
          ) : showError ? (
            <span
              style={{ color: '#666666', fontSize: '28px', fontWeight: 500 }}
            >
              ——
            </span>
          ) : rec ? (
            <Tooltip
              position="bottom"
              content="Action recommandée par le copilote. LONG = acheter en attendant une hausse. SHORT = vendre en attendant une baisse. FLAT = pas de trade, attendre un meilleur setup. Le copilote ne recommande LONG/SHORT que si au moins 5 signaux sur 8 convergent."
            >
              <span
                style={{
                  color: rec.color,
                  fontSize: '28px',
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                }}
              >
                {rec.glyph} {rec.text}
              </span>
            </Tooltip>
          ) : (
            <span
              style={{ color: '#666666', fontSize: '28px', fontWeight: 500 }}
            >
              ——
            </span>
          )}

          {/* Right: bias badge stack + confidence. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {showSkeleton ? (
              <Skeleton width={80} height={14} />
            ) : data && !showError ? (
              <Tooltip
                position="left"
                content="Biais directionnel sur l'or pour la session courante. BULLISH = on attend une hausse. BEARISH = on attend une baisse. NEUTRAL = pas de direction claire, rester flat."
              >
                <span style={biasBadgeStyle(data.bias)}>
                  {displayBias(data.bias)}
                </span>
              </Tooltip>
            ) : (
              <span style={{ color: '#666666', fontSize: '9px' }}>——</span>
            )}
            {data && !showError && (
              <span
                style={{
                  color: '#888888',
                  fontSize: '8px',
                  textAlign: 'right',
                  letterSpacing: '0.08em',
                }}
              >
                <span style={{ color: confidenceColor(data.confidence) }}>
                  {displayConfidence(data.confidence)}
                </span>{' '}
                <Tooltip
                  position="left"
                  content="Niveau de confiance du copilote dans sa thèse. ÉLEVÉE = plusieurs signaux alignés. MOYENNE = signaux mitigés. FAIBLE = peu clair, à traiter avec prudence — réduire la taille ou attendre."
                >
                  <span>CONFIANCE</span>
                </Tooltip>
              </span>
            )}
          </div>
        </div>

        {/* entryTiming + entryType badge on a second line. */}
        {(showSkeleton || (data && !showError)) && (
          <div style={{ marginTop: '8px' }}>
            {showSkeleton ? (
              <Skeleton widthPct="80%" height={9} />
            ) : data ? (
              <>
                <div
                  style={{ color: '#999999', fontSize: '9px', lineHeight: 1.5 }}
                >
                  {data.entryTiming}
                </div>
                {et && (
                  <div style={{ marginTop: '6px' }}>
                    <Tooltip position="left" content={et.tooltip}>
                      <span
                        style={{
                          ...et.style,
                          display: 'inline-block',
                          fontSize: '9px',
                          padding: '3px 8px',
                          letterSpacing: '0.08em',
                        }}
                      >
                        {et.text}
                      </span>
                    </Tooltip>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* 4. Trade parameters — entry/stop/target grid + R:R/HOLD + INVALIDATION. */}
      <div
        data-section="trade-params"
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #222222',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
          }}
        >
          <ParamCell
            label="ENTRÉE"
            value={showError ? undefined : data?.entry}
            color="#60a5fa"
            loading={showSkeleton}
            tooltip="Zone de prix à laquelle ouvrir la position. Attendre que le prix atteigne ce niveau améliore le ratio risque/récompense — ne pas chasser le prix au-delà."
          />
          <ParamCell
            label="STOP"
            value={showError ? undefined : data?.stop}
            color="#f87171"
            loading={showSkeleton}
            tooltip="Stop loss — sortir immédiatement à ce prix pour limiter la perte. Toujours utiliser un stop, placé au-delà d'un niveau structurel (swing high/low ou 1-1.5× ATR)."
          />
          <ParamCell
            label="OBJECTIF"
            value={showError ? undefined : data?.target}
            color="#4ade80"
            loading={showSkeleton}
            tooltip="Niveau de prise de profit. Atteint par le mouvement attendu du copilote. Le ratio risque/récompense est toujours minimum 1:2 — sinon, recommandation FLAT."
          />
        </div>

        {/* R:R + HOLD */}
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <div data-field="rr">
            <Tooltip
              position="left"
              content="Ratio risque/récompense — combien on gagne pour chaque dollar risqué. 1:2 = on risque $1 pour gagner $2. Vert si ≥ 1:2, ambre si ≥ 1:1.5, rouge si moins. Le copilote ne recommande que des trades avec R/R minimum 1:2."
            >
              <span style={labelStyle}>R/R</span>
            </Tooltip>{' '}
            {showSkeleton ? (
              <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                <Skeleton width={40} height={11} />
              </span>
            ) : (
              <span
                style={{
                  color:
                    showError || !data
                      ? '#666666'
                      : riskRewardColor(data.riskReward),
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {showError || !data ? '——' : data.riskReward}
              </span>
            )}
          </div>
          <div data-field="hold">
            <Tooltip
              position="left"
              content="Durée estimée de détention de la position avant que l'objectif ou le stop ne soit atteint. Pour le day trading sur l'or, typiquement 1 à 4 heures."
            >
              <span style={labelStyle}>DURÉE</span>
            </Tooltip>{' '}
            {showSkeleton ? (
              <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                <Skeleton width={50} height={11} />
              </span>
            ) : (
              <span
                style={{
                  color: showError || !data ? '#666666' : '#b0b0b0',
                  fontSize: '11px',
                }}
              >
                {showError || !data ? '——' : data.holdTime}
              </span>
            )}
          </div>
        </div>

        {/* INVALIDATION row — full width. */}
        <div
          data-field="invalidation"
          style={{
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Tooltip
            position="left"
            content="Niveau d'invalidation — prix auquel la thèse du trade est entièrement remise en cause, indépendamment du stop loss. Si le prix l'atteint, le setup est cassé : sortir et réévaluer même si le stop n'a pas été touché."
          >
            <span style={labelStyle}>INVALIDATION</span>
          </Tooltip>
          {showSkeleton ? (
            <Skeleton width={70} height={10} />
          ) : (
            <span
              style={{
                color: showError || !data ? '#666666' : '#b0b0b0',
                fontSize: '10px',
              }}
            >
              {showError || !data ? '——' : data.invalidationLevel}
            </span>
          )}
        </div>

        {/* [PHASE-3] Alt-scenario disclosure — only renders when
            altScenario is non-null. Collapsed by default; clicking
            the header expands a row with the trigger + mirror
            entry/stop/target. Same palette as the main params row
            (blue/red/green) but inset and at smaller weight so the
            primary trade reads first. */}
        {!showSkeleton && !showError && data?.altScenario ? (
          <AltScenarioRow scenario={data.altScenario} />
        ) : null}
      </div>

      {/* 5. Confluence score block. */}
      <div
        data-section="confluence"
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #222222',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tooltip
              position="left"
              content="Score de confluence pondéré — chaque signal contribue selon son poids (tendance et macro dominent ; news et calendrier sous-pondérés). Affichage 0-10. Le copilote recommande LONG/SHORT quand le côté dominant pèse au moins 5,0."
            >
              <span
                style={{
                  color: '#888888',
                  fontSize: '9px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                CONFLUENCE
              </span>
            </Tooltip>
            {/* [PHASE-2] Setup chip — only renders when a named
                setup matched. Inline next to the CONFLUENCE label
                so the trader scans both at the same eye line. */}
            {!showSkeleton && !showError && data?.detectedSetup ? (
              <Tooltip
                position="bottom"
                content="Setup nommé détecté — pattern récurrent à haute probabilité. La détection ouvre la voie aux statistiques par setup et aux entrées plus précises dans les phases suivantes."
              >
                <span
                  style={{
                    color: '#60a5fa',
                    background: '#0a1420',
                    border: '1px solid #1a2a3a',
                    fontSize: '8px',
                    padding: '1px 5px',
                    letterSpacing: '0.08em',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {displaySetupName(data.detectedSetup)}
                </span>
              </Tooltip>
            ) : null}
          </div>
          {showSkeleton ? (
            <Skeleton width={48} height={12} />
          ) : data && !showError ? (
            (() => {
              // [PHASE-2] Prefer the weighted score when present.
              // Old records that pre-date this field fall back to
              // the legacy "N/8" integer display.
              const wc = data.weightedConfluence
              const display = wc
                ? `${wc.score.toFixed(1)}/${wc.max.toFixed(0)}`
                : `${data.confluenceScore}/${data.confluenceTotal}`
              // Palette tracks the dominant direction (weighted
              // when available, bias when not) — green/red/amber
              // matches the rest of the card.
              const dom = wc?.dominant ?? data.bias
              const color =
                dom === 'BULLISH'
                  ? '#4ade80'
                  : dom === 'BEARISH'
                    ? '#f87171'
                    : '#fbbf24'
              return (
                <span
                  style={{ color, fontSize: '12px', fontWeight: 500 }}
                >
                  {display}
                </span>
              )
            })()
          ) : (
            <span style={{ color: '#666666', fontSize: '12px' }}>——</span>
          )}
        </div>

        {/* [PHASE-2] Score bar. 10 cells when weighted score is
            present (one per integer point of the weighted total),
            8 cells for legacy records — fills proportionally to
            the dominant side's score. */}
        <div style={{ display: 'flex', gap: '3px' }}>
          {(() => {
            const wc = data?.weightedConfluence
            const cells = wc ? 10 : 8
            const score = wc ? wc.score : data?.confluenceScore ?? 0
            const dom = wc?.dominant ?? data?.bias
            const filledColor =
              dom === 'BULLISH'
                ? '#4ade80'
                : dom === 'BEARISH'
                  ? '#f87171'
                  : '#fbbf24'
            return Array.from({ length: cells }).map((_, i) => {
              // Use the integer floor of the score so a 7.4 fills
              // 7 cells; the 8th-cell glow is reserved for an
              // 8.0+ "very strong" signal in a future revision.
              const filled =
                !showSkeleton && !showError && data ? i < Math.floor(score) : false
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: '4px',
                    borderRadius: '1px',
                    background: filled ? filledColor : '#1e1e1e',
                    border: filled ? 'none' : '1px solid #2a2a2a',
                  }}
                />
              )
            })
          })()}
        </div>

        {/* 8-signal breakdown grid. */}
        <div
          style={{
            marginTop: '8px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
          }}
        >
          {SIGNAL_ORDER.map((key) => (
            <SignalRow
              key={key}
              label={SIGNAL_LABELS[key]}
              bias={showError ? undefined : data?.signals[key]}
              loading={showSkeleton}
              tooltip={SIGNAL_TOOLTIPS[key]}
            />
          ))}
        </div>
      </div>

      {/* 6. Catalyst block — NOW / RISK / TRIGGER + exitPlan. */}
      <div
        data-section="catalyst"
        style={{ padding: '8px 12px', borderBottom: '1px solid #222222' }}
      >
        {showSkeleton ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton widthPct="90%" height={8} />
            <Skeleton widthPct="75%" height={8} />
            <Skeleton widthPct="60%" height={8} />
          </div>
        ) : showError ? (
          <>
            <div style={{ color: '#f87171', fontSize: '10px' }}>ÉCHEC ANALYSE</div>
            <div
              style={{ color: '#888888', fontSize: '9px', marginTop: '4px' }}
            >Vérifier la clé API et réessayer.</div>
          </>
        ) : data && cat ? (
          <>
            {/* NOW */}
            <div data-catalyst="now" style={{ marginBottom: '4px' }}>
              <Tooltip
                position="left"
                content="Ce qui fait bouger l'or maintenant — résume en une phrase le moteur principal du marché : actualité, donnée macro, déclencheur technique."
              >
                <span style={{ ...labelStyle, marginRight: '4px' }}>
                  MAINT.
                </span>
              </Tooltip>
              <span
                style={{ color: '#999999', fontSize: '9px', lineHeight: 1.5 }}
              >
                {cat.now}
              </span>
            </div>
            {/* RISK */}
            <div data-catalyst="risk" style={{ marginBottom: '4px' }}>
              <Tooltip
                position="left"
                content="La principale menace qui peut invalider le trade. Surveiller ce signal — s'il se déclenche, sortir avant que le stop loss ne saute."
              >
                <span
                  style={{
                    ...labelStyle,
                    color: '#f87171',
                    marginRight: '4px',
                  }}
                >
                  RISQUE
                </span>
              </Tooltip>
              <span
                style={{ color: '#999999', fontSize: '9px', lineHeight: 1.5 }}
              >
                {cat.risk}
              </span>
            </div>
            {/* TRIGGER */}
            <div data-catalyst="trigger">
              <Tooltip
                position="left"
                content="L'événement précis ou l'action de prix qui confirme que l'entrée est valide MAINTENANT. Ne pas entrer avant que ce déclencheur ne se manifeste."
              >
                <span
                  style={{
                    ...labelStyle,
                    color: '#4ade80',
                    marginRight: '4px',
                  }}
                >
                  DÉCLENCH.
                </span>
              </Tooltip>
              <span
                style={{
                  color: '#b0b0b0',
                  fontSize: '9px',
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                }}
              >
                {cat.trigger}
              </span>
            </div>
            {/* exitPlan */}
            <div
              data-catalyst="exit"
              style={{
                marginTop: '6px',
                color: '#555555',
                fontSize: '9px',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              <Tooltip
                position="left"
                content="Plan de sortie — quand et comment couper la position. Couvre les sorties pré-événement (ex. avant FOMC) et les sorties à objectif/stop."
              >
                <span style={{ ...labelStyle, marginRight: '4px' }}>
                  SORTIE
                </span>
              </Tooltip>
              {data.exitPlan}
            </div>
          </>
        ) : (
          <div style={{ color: '#666666', fontSize: '9px' }}>Lancer une analyse pour générer une thèse de trade.</div>
        )}
      </div>

      {/* [SPRINT-11] Calibration card — accuracy by confidence level.
          Below 10 decided outcomes: shows a progress bar so the
          trader knows how many more analyses they need.
          At ≥10 outcomes: three rows (HIGH/MEDIUM/LOW) with
          accuracy bars + an insight line under them. The card
          slots between the catalyst block and the action button
          per the SPRINT-11 spec. */}
      {calibration && (
        <div
          data-section="calibration"
          style={{
            padding: '8px 12px',
            borderTop: '1px solid #222222',
            borderBottom: '1px solid #222222',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <Tooltip
              position="left"
              content="Précision historique des niveaux de confiance du système sur vos trades. La confiance HAUTE devrait être plus souvent correcte que MOYENNE. Sinon, ajuster votre stratégie en conséquence. Nécessite au moins 10 résultats de trades clôturés."
            >
              <span
                style={{
                  color: '#888888',
                  fontSize: '9px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                CALIBRATION
              </span>
            </Tooltip>
            <span style={{ color: '#444444', fontSize: '9px' }}>
              {calibration.recordsWithOutcome} {T.calibrationOutcomes}
            </span>
          </div>

          {!calibration.isCalibrated ? (
            // Not yet calibrated — show progress toward 10 outcomes.
            <>
              <div style={{ color: '#444444', fontSize: '9px', marginBottom: '4px' }}>
                {calibration.recordsWithOutcome}/10 {T.calibrationOutcomesNeeded}
              </div>
              <div
                style={{
                  height: '2px',
                  background: '#1e1e1e',
                  borderRadius: '1px',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, (calibration.recordsWithOutcome / 10) * 100)}%`,
                    height: '2px',
                    background: '#444444',
                    borderRadius: '1px',
                  }}
                />
              </div>
            </>
          ) : (
            <CalibrationRows calibration={calibration} />
          )}
        </div>
      )}

      {/* 7. Action button — primary CTA for the dashboard.
            Four states:
              idle             → white bg + black text (CTA pop)
              hover (idle)     → very-light-grey bg, same darker text
              loading          → muted grey bg + dim text, disabled
              calendar-blocked → amber-tinted dark bg + amber text,
                                 disabled
            Outline-style was muted enough to read as secondary;
            now this is unmistakably the action the trader is
            meant to take. */}
      <button
        data-section="run-analysis-cta"
        className="terminal-btn"
        onClick={onClickRun}
        disabled={loading || calendarBlocked}
        onMouseEnter={() => setHoverBtn(true)}
        onMouseLeave={() => setHoverBtn(false)}
        style={{
          margin: '12px',
          width: 'calc(100% - 24px)',
          height: '36px',
          background: loading
            ? '#1a1a1a'
            : calendarBlocked
              ? '#1a0e00'
              : hoverBtn
                ? '#e5e5e5'
                : '#f5f5f5',
          border: `1px solid ${
            loading
              ? '#222222'
              : calendarBlocked
                ? '#3a2200'
                : hoverBtn
                  ? '#cccccc'
                  : '#f5f5f5'
          }`,
          color: loading
            ? '#666666'
            : calendarBlocked
              ? '#fbbf24'
              : '#0a0a0a',
          fontFamily: 'var(--font-sans)',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.12em',
          cursor: loading || calendarBlocked ? 'not-allowed' : 'pointer',
          borderRadius: '2px',
        }}
      >
        {loading
          ? 'ANALYSE EN COURS...'
          : calendarBlocked
            ? '⚠ CALENDRIER BLOQUÉ — ANALYSE DÉSACTIVÉE'
            : showError
              ? 'RÉESSAYER'
              : "LANCER L'ANALYSE"}
      </button>

      {/* 8. Footer — last analysis time + technicals last update. */}
      <div
        data-section="copilot-footer"
        style={{
          padding: '0 12px 8px 12px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        {data && !showError ? (
          <span style={{ color: '#666666', fontSize: '8px' }}>
            DERN. : {formatDateTime(data.generatedAt)}
          </span>
        ) : (
          <span />
        )}
        {technicals.lastUpdated ? (
          <span style={{ color: '#666666', fontSize: '8px' }}>
            IND. :{' '}
            {technicals.lastUpdated.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </span>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
