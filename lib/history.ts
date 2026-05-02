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
    return parsed.filter(isValidRecord)
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

// Fill in the +2H or +4H outcome on a single record. Called by
// the useHistory hook's interval checker — once at +2H per record,
// once again at +4H. Idempotent on the storage write so a duplicate
// call (e.g. on a stale interval) doesn't corrupt anything.
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

// Pick the most authoritative outcome on a record. Prefer 4H
// (more time for the trade to resolve); fall back to 2H so
// freshly-decided records aren't excluded for the first two hours
// of their lifetime.
function getDecidedOutcome(r: AnalysisHistoryRecord): TradeOutcome | null {
  const o = r.outcome4H ?? r.outcome2H
  if (o === undefined) return null
  return o
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

  // Records with at least one outcome (even if OPEN/INCONCLUSIVE)
  // are counted in totalWithOutcome so the onboarding gauge
  // (5/5 outcomes needed) reflects what the trader sees. The
  // accuracy buckets below filter further down to decided
  // outcomes only.
  const withOutcome = all.filter(
    (r) => r.outcome4H !== undefined || r.outcome2H !== undefined
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
