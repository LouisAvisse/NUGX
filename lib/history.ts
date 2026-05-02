// lib/history.ts — analysis history + outcome tracking, persisted
// in localStorage. Every successful /api/analyze run becomes one
// AnalysisHistoryRecord; a follow-up checker (driven by
// useHistory) writes 2H and 4H outcome fields after the trade
// idea has had time to play out.
//
// CLIENT-ONLY. Every function below reads/writes window.localStorage
// directly; calling them on the server (e.g. inside a server
// component) will throw. The hook in lib/hooks/useHistory.ts is
// the only consumer.
//
// Storage shape: a JSON array of AnalysisHistoryRecord, newest
// first, capped at MAX_RECORDS. Why an array: simple to JSON-
// serialize, simple to slice + filter, no key-collision concerns
// since record ids are uuids.
//
// Outcome math: parse entry/stop/target out of the record's free-
// form strings (Marcus emits ranges like "3281-3284" or single
// values like "3265"); compare currentPrice; classify HIT_TARGET
// / HIT_STOP / OPEN / INCONCLUSIVE per the spec.

import type {
  AnalysisHistoryRecord,
  AnalysisResult,
  PersonalPatterns,
  TradeOutcome,
} from '@/lib/types'
import { parsePrice } from '@/lib/utils'

// Single localStorage key — matches the journal pattern from
// .claude/context.md ("goldDashboard_*").
const STORAGE_KEY = 'goldDashboard_analysisHistory'

// Cap on records kept locally. 200 records ≈ several months of
// daily trading at a few analyses per session, plenty for
// PersonalPatterns to converge.
const MAX_RECORDS = 200

// Minimum decided outcomes (HIT_TARGET / HIT_STOP) before a
// session / confluence-score / entry-type bucket is considered
// trustworthy enough to surface. Matches the spec's "minimum 3"
// for bestSession + accuracy bars.
const MIN_BUCKET_OUTCOMES = 3

// Confluence-threshold heuristic: lowest score where accuracy
// crosses this percent and we have at least MIN_THRESHOLD_OUTCOMES
// behind it. Both numbers come straight from the spec.
const THRESHOLD_ACCURACY_PCT = 65
const MIN_THRESHOLD_OUTCOMES = 5

// Random id helper. crypto.randomUUID is browser-only and
// available in every modern browser; fall back to a manual id
// if it's missing (some non-secure contexts disable it).
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// [SPRINT-12] Local wrapper now delegates to the shared parsePrice
// helper in lib/utils. parsePrice returns 0 when nothing parses
// — `classifyOutcome` already treats 0 as "unparseable" via the
// `stop === 0 || target === 0` check below, so the calling
// semantics are unchanged.
function parseFirstNumber(s: string | undefined): number {
  return parsePrice(s)
}

// [SECURITY L6] Per-record schema validation. Without this,
// downstream math (bucketStats, accuracy %) silently produces NaN
// when a stray field arrives as the wrong type — e.g. another
// browser tab, a DevTools edit, or a future schema migration
// writes confluenceScore: "8" instead of 8. Validating on read
// drops corrupted records rather than letting NaN poison the
// MEMORY tab + the personal-patterns context fed to Claude.
//
// We check load-bearing fields only (id, recommendation,
// confluenceScore, session, entryType) — fields used by
// classifyOutcome / bucketStats / groupBy. Optional outcome
// fields are not validated; they're already typed as optional.
const VALID_RECOMMENDATIONS = new Set(['LONG', 'SHORT', 'FLAT'])
const VALID_ENTRY_TYPES = new Set(['IDEAL', 'AGGRESSIVE', 'WAIT'])
function isValidRecord(r: unknown): r is AnalysisHistoryRecord {
  if (!r || typeof r !== 'object') return false
  const x = r as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    typeof x.generatedAt === 'string' &&
    typeof x.confluenceScore === 'number' &&
    typeof x.session === 'string' &&
    typeof x.recommendation === 'string' &&
    VALID_RECOMMENDATIONS.has(x.recommendation) &&
    typeof x.entryType === 'string' &&
    VALID_ENTRY_TYPES.has(x.entryType)
  )
}

// [PHASE-1] One-shot legacy migration. Records that pre-date the
// path-replay fix were classified by the old point-in-time
// comparator (false-positive whenever price hit stop and then
// mean-reverted to target before +4H). They get tagged here so
// every accuracy surface (bucketStats, computeCalibration) can
// filter them out. Idempotent: only flips undefined → true,
// never overwrites a record that already has hitOutcome.
//
// Gated by a localStorage flag + an in-memory `migrated` boolean
// so it runs at most once per session, not per readAll() call.
const LEGACY_MIGRATION_KEY = 'goldDashboard_legacyMigrated_v1'
let migrated = false
function migrateLegacyTags(records: AnalysisHistoryRecord[]): AnalysisHistoryRecord[] {
  if (migrated) return records
  migrated = true
  if (typeof window === 'undefined') return records
  try {
    if (window.localStorage.getItem(LEGACY_MIGRATION_KEY) === '1') {
      return records
    }
  } catch {
    return records
  }
  let touched = false
  for (const r of records) {
    const hasLegacyOutcome =
      r.outcome2H !== undefined || r.outcome4H !== undefined
    if (
      hasLegacyOutcome &&
      r.hitOutcome === undefined &&
      r.legacyOutcome === undefined
    ) {
      r.legacyOutcome = true
      touched = true
    }
  }
  if (touched) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    } catch {
      // Quota / serialize failure — drop the write. Migration
      // re-runs next session because LEGACY_MIGRATION_KEY won't
      // be set; that's fine, the operation is idempotent.
    }
  }
  try {
    window.localStorage.setItem(LEGACY_MIGRATION_KEY, '1')
  } catch {
    // Same posture — flag write failure means we'll re-attempt
    // next session, which is harmless.
  }
  return records
}

// Read + parse the stored array. Defensive against any kind of
// storage corruption: missing key, non-JSON, non-array, missing
// fields, or per-record schema violations. Always returns an
// array; callers don't need to wrap in their own try/catch.
function readAll(): AnalysisHistoryRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // [SECURITY L6] Drop records that don't pass the per-record
    // schema check — the array stays well-typed downstream.
    const valid = parsed.filter(isValidRecord)
    // [PHASE-1] Tag pre-fix records as legacy so calibration
    // doesn't read their false-positive outcomes.
    return migrateLegacyTags(valid)
  } catch {
    return []
  }
}

// Write the array back, trimmed to MAX_RECORDS. Trim from the end
// (oldest records) since newest-first is the canonical order.
function writeAll(records: AnalysisHistoryRecord[]): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = records.slice(0, MAX_RECORDS)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Storage quota / serialization failure — no good recovery
    // from here; drop the write rather than crash the app.
  }
}

// Save a new analysis to history. Called from AnalysisPanel
// immediately after a successful /api/analyze response. Returns
// the saved record so the caller can use its id (e.g. for
// invalidation alerts).
export function saveAnalysis(
  result: AnalysisResult,
  price: number,
  session: string
): AnalysisHistoryRecord {
  const record: AnalysisHistoryRecord = {
    id: genId(),
    generatedAt: result.generatedAt,
    priceAtAnalysis: price,
    bias: result.bias,
    confidence: result.confidence,
    recommendation: result.recommendation,
    confluenceScore: result.confluenceScore,
    confluenceTotal: result.confluenceTotal,
    session,
    entryType: result.entryType,
    marketCondition: result.marketCondition,
    entry: result.entry,
    stop: result.stop,
    target: result.target,
    invalidationLevel: result.invalidationLevel,
    riskReward: result.riskReward,
    // Outcome fields all undefined initially — the follow-up
    // checker fills priceAt2H / outcome2H at +2H, then
    // priceAt4H / outcome4H at +4H.
  }
  const all = readAll()
  all.unshift(record)
  writeAll(all)
  return record
}

// Read every record, newest first. Already the storage order
// (records are unshifted on save) but we sort defensively in
// case a caller mutates the array out-of-order.
export function getHistory(): AnalysisHistoryRecord[] {
  return readAll().slice().sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  )
}

// Compute outcome from a recommendation + level strings + a
// current price. Centralised here so updateOutcome and any
// downstream consumers (e.g. the journal dashboard) read the
// same logic.
//
// Rules (from the spec):
//   LONG  : >=target → HIT_TARGET, <=stop → HIT_STOP,
//           between → OPEN, unparseable → INCONCLUSIVE
//   SHORT : <=target → HIT_TARGET, >=stop → HIT_STOP,
//           between → OPEN, unparseable → INCONCLUSIVE
//   FLAT  : always INCONCLUSIVE (there's no trade to win/lose)
function classifyOutcome(
  record: AnalysisHistoryRecord,
  currentPrice: number
): TradeOutcome {
  if (record.recommendation === 'FLAT') return 'INCONCLUSIVE'

  const stop = parseFirstNumber(record.stop)
  const target = parseFirstNumber(record.target)
  if (!Number.isFinite(stop) || !Number.isFinite(target) || stop === 0 || target === 0) {
    return 'INCONCLUSIVE'
  }

  if (record.recommendation === 'LONG') {
    if (currentPrice >= target) return 'HIT_TARGET'
    if (currentPrice <= stop) return 'HIT_STOP'
    return 'OPEN'
  }
  // SHORT
  if (currentPrice <= target) return 'HIT_TARGET'
  if (currentPrice >= stop) return 'HIT_STOP'
  return 'OPEN'
}

// [PHASE-1] One 5-min candle as returned by /api/replay. We only
// keep the fields replayPath actually reads; close is preserved
// for future scenarios (e.g. computing path return at horizon).
export interface ReplayCandle {
  time: number   // unix seconds
  high: number
  low: number
  close: number
}

// Minimum candles required for a meaningful classification —
// 24 5-min bars ≈ 2h of data. Below this we don't have enough
// path to call HIT_TARGET / HIT_STOP confidently and return
// INCONCLUSIVE. Yahoo gaps on weekends easily push some windows
// below this threshold.
const MIN_CANDLES_FOR_REPLAY = 24

// [PHASE-1] Path-based classifier — replaces the broken
// point-in-time `classifyOutcome`. Walks candles in time order
// and returns whichever level was wick-touched FIRST.
//
// Same-candle ambiguity (a single 5-min bar whose wick swept
// both stop and target): STOP wins. Conservative — better to
// under-report wins than over-report them; matches the
// "assume worst-case fill" posture institutional desks use.
//
// Returns INCONCLUSIVE for: FLAT records (no trade), unparseable
// stop/target strings (e.g. "——"), too few candles
// (<MIN_CANDLES_FOR_REPLAY).
export function replayPath(
  record: AnalysisHistoryRecord,
  candles: ReplayCandle[]
): {
  hitOutcome: TradeOutcome
  hitAt?: string
  pathMaxFavorable: number
  pathMaxAdverse: number
} {
  const priceAnchor = record.priceAtAnalysis
  const inconclusive = {
    hitOutcome: 'INCONCLUSIVE' as TradeOutcome,
    pathMaxFavorable: priceAnchor,
    pathMaxAdverse: priceAnchor,
  }

  if (record.recommendation === 'FLAT') return inconclusive
  if (candles.length < MIN_CANDLES_FOR_REPLAY) return inconclusive

  const stop = parseFirstNumber(record.stop)
  const target = parseFirstNumber(record.target)
  if (
    !Number.isFinite(stop) ||
    !Number.isFinite(target) ||
    stop === 0 ||
    target === 0
  ) {
    return inconclusive
  }

  const isLong = record.recommendation === 'LONG'

  // Path extremes — favorable = best price seen for the trade
  // direction (high for LONG, low for SHORT); adverse = the
  // worst (drawdown).
  let favorable = isLong ? -Infinity : Infinity
  let adverse = isLong ? Infinity : -Infinity

  for (const c of candles) {
    // Update extremes BEFORE the hit check so a candle that
    // resolves the trade still contributes its wick to the path
    // statistics.
    if (isLong) {
      if (c.high > favorable) favorable = c.high
      if (c.low < adverse) adverse = c.low
    } else {
      if (c.low < favorable) favorable = c.low
      if (c.high > adverse) adverse = c.high
    }

    // Stop check first → conservative tie-break on same-candle
    // ambiguity. For LONG, stop is below entry → triggered when
    // candle low ≤ stop. For SHORT, stop is above entry →
    // triggered when candle high ≥ stop.
    const stopHit = isLong ? c.low <= stop : c.high >= stop
    const targetHit = isLong ? c.high >= target : c.low <= target

    if (stopHit) {
      return {
        hitOutcome: 'HIT_STOP',
        hitAt: new Date(c.time * 1000).toISOString(),
        pathMaxFavorable: favorable,
        pathMaxAdverse: adverse,
      }
    }
    if (targetHit) {
      return {
        hitOutcome: 'HIT_TARGET',
        hitAt: new Date(c.time * 1000).toISOString(),
        pathMaxFavorable: favorable,
        pathMaxAdverse: adverse,
      }
    }
  }

  // Walked the full window without hitting either level. The
  // trade ran out of time — classified OPEN. Calibration math
  // already excludes OPEN from accuracy buckets via
  // getDecidedOutcome, so this isn't a false positive.
  return {
    hitOutcome: 'OPEN',
    pathMaxFavorable: favorable,
    pathMaxAdverse: adverse,
  }
}

// [PHASE-1] Persist the result of a path replay to a single
// record. Called by the useHistory checker once /api/replay
// returns enough candles + bufferOk=true. Idempotent: skips if
// hitOutcome is already set.
//
// Returns true when the record was written, false otherwise —
// useful for the hook to decide whether to dispatch the
// historyUpdated event.
export function updateOutcomeFromReplay(
  id: string,
  candles: ReplayCandle[]
): boolean {
  const all = readAll()
  const idx = all.findIndex((r) => r.id === id)
  if (idx < 0) return false
  const record = all[idx]
  if (record.hitOutcome !== undefined) return false

  const result = replayPath(record, candles)
  record.hitOutcome = result.hitOutcome
  record.hitAt = result.hitAt
  record.pathMaxFavorable = result.pathMaxFavorable
  record.pathMaxAdverse = result.pathMaxAdverse
  record.replayCheckedAt = new Date().toISOString()
  record.replayCandleCount = candles.length

  all[idx] = record
  writeAll(all)
  return true
}

// [LEGACY] Fill in the +2H or +4H outcome on a single record.
// Pre-Phase-1 callers used this; superseded by
// updateOutcomeFromReplay above. Retained because the function
// is exported and may be referenced by future migration tooling.
export function updateOutcome(
  id: string,
  timeframe: '2H' | '4H',
  currentPrice: number
): void {
  const all = readAll()
  const idx = all.findIndex((r) => r.id === id)
  if (idx < 0) return
  const record = all[idx]
  const outcome = classifyOutcome(record, currentPrice)
  const checkedAt = new Date().toISOString()

  if (timeframe === '2H') {
    record.priceAt2H = currentPrice
    record.checkedAt2H = checkedAt
    record.outcome2H = outcome
  } else {
    record.priceAt4H = currentPrice
    record.checkedAt4H = checkedAt
    record.outcome4H = outcome
  }
  all[idx] = record
  writeAll(all)
}

// [PHASE-1] Pick the authoritative outcome on a record.
//
// Reads ONLY the path-based hitOutcome — the legacy
// outcome2H/outcome4H fields are NOT a fallback because their
// classifier was structurally broken (false positives whenever
// price hit stop and then mean-reverted to target before +4H).
// Records carrying legacyOutcome=true return null so they're
// excluded from every accuracy surface.
//
// Calibration card naturally hides itself until enough fresh
// (post-Phase-1) outcomes accumulate via the
// MIN_CALIBRATED_OUTCOMES gate in lib/calibration.ts.
function getDecidedOutcome(r: AnalysisHistoryRecord): TradeOutcome | null {
  if (r.legacyOutcome) return null
  if (r.hitOutcome === undefined) return null
  return r.hitOutcome
}

// Bucket-accuracy helper used across bySession / byConfluenceScore /
// byEntryType. Counts records whose decided outcome is HIT_TARGET
// (correct) vs HIT_STOP (incorrect); OPEN + INCONCLUSIVE are
// excluded — we don't have a verdict on those yet.
function bucketStats(records: AnalysisHistoryRecord[]): {
  count: number
  accurate: number
  accuracy: number
} {
  const decided = records
    .map(getDecidedOutcome)
    .filter((o): o is TradeOutcome => o === 'HIT_TARGET' || o === 'HIT_STOP')
  if (decided.length === 0) {
    return { count: records.length, accurate: 0, accuracy: 0 }
  }
  const accurate = decided.filter((o) => o === 'HIT_TARGET').length
  return {
    count: records.length,
    accurate,
    accuracy: Math.round((accurate / decided.length) * 100),
  }
}

// Group records into a Record<key, AnalysisHistoryRecord[]> by a
// key extractor. Lighter-weight than reaching for lodash given we
// already keep the bundle dependency-free.
function groupBy<K extends string | number>(
  records: AnalysisHistoryRecord[],
  key: (r: AnalysisHistoryRecord) => K
): Record<K, AnalysisHistoryRecord[]> {
  const out = {} as Record<K, AnalysisHistoryRecord[]>
  for (const r of records) {
    const k = key(r)
    if (!out[k]) out[k] = []
    out[k].push(r)
  }
  return out
}

// Compute the aggregate PersonalPatterns from the full history.
// Pure function over getHistory()'s output — exported separately
// so the useHistory hook can call it post-mutation without
// re-fetching from storage.
export function getPersonalPatterns(): PersonalPatterns {
  const all = getHistory()
  const totalAnalyses = all.length

  // [PHASE-1] Records with at least one path-based outcome
  // (even if OPEN/INCONCLUSIVE) are counted in totalWithOutcome
  // so the onboarding gauge reflects what the trader sees.
  // Legacy point-in-time records are excluded — their classifier
  // was broken; counting them would let the gauge claim "ready"
  // when the underlying accuracy math is still empty.
  const withOutcome = all.filter(
    (r) => r.hitOutcome !== undefined && !r.legacyOutcome
  )
  const totalWithOutcome = withOutcome.length

  const decidedAll = withOutcome.filter((r) => {
    const o = getDecidedOutcome(r)
    return o === 'HIT_TARGET' || o === 'HIT_STOP'
  })
  const overallAccurate = decidedAll.filter(
    (r) => getDecidedOutcome(r) === 'HIT_TARGET'
  ).length
  const overallAccuracy =
    decidedAll.length > 0
      ? Math.round((overallAccurate / decidedAll.length) * 100)
      : 0

  const sessionGroups = groupBy(withOutcome, (r) => r.session)
  const bySession: PersonalPatterns['bySession'] = {}
  for (const [session, recs] of Object.entries(sessionGroups)) {
    bySession[session] = bucketStats(recs)
  }

  const scoreGroups = groupBy(withOutcome, (r) => r.confluenceScore)
  const byConfluenceScore: PersonalPatterns['byConfluenceScore'] = {}
  for (const [score, recs] of Object.entries(scoreGroups)) {
    byConfluenceScore[Number(score)] = bucketStats(recs)
  }

  const entryGroups = groupBy(withOutcome, (r) => r.entryType)
  const byEntryType: PersonalPatterns['byEntryType'] = {}
  for (const [type, recs] of Object.entries(entryGroups)) {
    byEntryType[type] = bucketStats(recs)
  }

  // Best session = highest accuracy with at least
  // MIN_BUCKET_OUTCOMES decided outcomes. Returns null when no
  // session bucket meets the threshold yet.
  let bestSession: string | null = null
  let bestSessionAccuracy = -1
  for (const [session, stats] of Object.entries(bySession)) {
    if (stats.count < MIN_BUCKET_OUTCOMES) continue
    if (stats.accuracy > bestSessionAccuracy) {
      bestSession = session
      bestSessionAccuracy = stats.accuracy
    }
  }

  // Best confluence threshold — the LOWEST score where accuracy
  // ≥ THRESHOLD_ACCURACY_PCT and the bucket has ≥
  // MIN_THRESHOLD_OUTCOMES samples. The lowest one that qualifies
  // is what the trader uses as a go/no-go threshold ("only trade
  // when score ≥ X").
  let bestConfluenceThreshold: number | null = null
  for (const [scoreStr, stats] of Object.entries(byConfluenceScore)) {
    const score = Number(scoreStr)
    if (stats.count < MIN_THRESHOLD_OUTCOMES) continue
    if (stats.accuracy < THRESHOLD_ACCURACY_PCT) continue
    if (bestConfluenceThreshold === null || score < bestConfluenceThreshold) {
      bestConfluenceThreshold = score
    }
  }

  // Human-readable insight string. Spec-driven branching: less
  // than 5 outcomes shows the onboarding line; otherwise we lead
  // with whichever signal is most informative.
  let insight: string
  if (totalWithOutcome < 5) {
    insight = `Not enough data yet. ${totalWithOutcome}/5 outcomes recorded. Keep trading.`
  } else if (bestSession && overallAccuracy > 50) {
    const stats = bySession[bestSession]
    insight = `Your best session is ${bestSession} with ${stats.accuracy}% accuracy across ${stats.count} trades.`
  } else if (bestConfluenceThreshold !== null) {
    const stats = byConfluenceScore[bestConfluenceThreshold]
    insight = `You perform best at ${bestConfluenceThreshold}+ confluence with ${stats.accuracy}% accuracy.`
  } else {
    insight = `Based on ${decidedAll.length} outcomes, overall accuracy is ${overallAccuracy}%.`
  }

  return {
    totalAnalyses,
    totalWithOutcome,
    overallAccuracy,
    bySession,
    byConfluenceScore,
    byEntryType,
    bestSession,
    bestConfluenceThreshold,
    insight,
  }
}

// Wipe history. Dev / reset helper — not currently wired to a
// UI control but useful from the browser console during testing
// (`window.__clearHistory?.()` style hooks could be added later).
export function clearHistory(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Same posture as writeAll — drop the failure rather than
    // bubble it up to the UI.
  }
}
