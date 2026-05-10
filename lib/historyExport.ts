// lib/historyExport.ts — [PHASE-12.5] CSV / JSON export helpers.
//
// One-shot data dumps the trader can drop into Excel / Google
// Sheets / Python without writing any glue. Two flavors:
//
//   exportJournalCsv()       — closed + open trades from journal
//   exportAnalysisHistoryCsv()
//                            — every analysis the system has run,
//                              with outcome where known
//
// Pure formatters; the consumer (a button) plugs the returned
// string into a Blob + download link. Browser-only by design.

import type {
  AnalysisHistoryRecord,
  JournalEntry,
} from '@/lib/types'

// Escape one CSV cell — wrap in quotes when needed and double up
// any internal quotes. Conservative; quotes on every cell would
// also be valid but harder to skim raw.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// Build a CSV string from a header row + value rows. Adds a
// trailing newline so concatenation in shell pipelines doesn't
// lose the last row.
function buildCsv(header: string[], rows: unknown[][]): string {
  const headLine = header.join(',')
  const bodyLines = rows.map((r) => r.map(csvCell).join(','))
  return [headLine, ...bodyLines].join('\n') + '\n'
}

// One JournalEntry → CSV row. Closed entries carry an exit price
// + computed P&L; open entries leave those blank.
function journalRow(e: JournalEntry): unknown[] {
  const dirSign = e.direction === 'LONG' ? 1 : -1
  const closed =
    typeof e.exitPrice === 'number' && Number.isFinite(e.exitPrice)
  const pnl = closed ? (e.exitPrice! - e.entry) * dirSign * 100 : ''
  const rRisk = Math.abs(e.entry - e.stop) * 100
  const rMult = closed && rRisk > 0 ? Number(pnl) / rRisk : ''
  return [
    e.id,
    e.direction,
    e.session,
    e.entry,
    e.stop,
    e.target,
    closed ? e.exitPrice : '',
    pnl,
    rMult,
    e.createdAt,
    e.closedAt ?? '',
    e.mgmtState ?? '',
    e.notes,
  ]
}

export function exportJournalCsv(entries: JournalEntry[]): string {
  const header = [
    'id',
    'direction',
    'session',
    'entry',
    'stop',
    'target',
    'exit',
    'pnl_usd',
    'r_multiple',
    'createdAt',
    'closedAt',
    'mgmtState',
    'notes',
  ]
  return buildCsv(header, entries.map(journalRow))
}

// One AnalysisHistoryRecord → CSV row. Carries the recommendation
// shape + path-replay outcome so external tools can compute their
// own per-setup / per-confluence stats.
function analysisRow(r: AnalysisHistoryRecord): unknown[] {
  return [
    r.id,
    r.generatedAt,
    r.priceAtAnalysis,
    r.bias,
    r.confidence,
    r.recommendation,
    r.confluenceScore,
    r.confluenceTotal,
    r.session,
    r.entryType,
    r.marketCondition,
    r.entry,
    r.stop,
    r.target,
    r.invalidationLevel,
    r.riskReward,
    r.detectedSetup ?? '',
    r.weightedConfluence?.score ?? '',
    r.weightedConfluence?.dominant ?? '',
    r.hitOutcome ?? '',
    r.hitAt ?? '',
    r.pathMaxFavorable ?? '',
    r.pathMaxAdverse ?? '',
    r.legacyOutcome ? 'true' : '',
  ]
}

export function exportAnalysisHistoryCsv(
  records: AnalysisHistoryRecord[]
): string {
  const header = [
    'id',
    'generatedAt',
    'priceAtAnalysis',
    'bias',
    'confidence',
    'recommendation',
    'confluenceScore',
    'confluenceTotal',
    'session',
    'entryType',
    'marketCondition',
    'entry',
    'stop',
    'target',
    'invalidationLevel',
    'riskReward',
    'detectedSetup',
    'weightedScore',
    'weightedDominant',
    'hitOutcome',
    'hitAt',
    'pathMaxFavorable',
    'pathMaxAdverse',
    'legacyOutcome',
  ]
  return buildCsv(header, records.map(analysisRow))
}

// One-stop JSON dump of everything the dashboard remembers about
// this trader. Used as the offline-analysis bundle ("download
// everything"). The trader's full journal + analysis history +
// generation timestamp + simple version stamp.
export interface ExportBundle {
  version: 1
  generatedAt: string
  journal: JournalEntry[]
  analyses: AnalysisHistoryRecord[]
}

export function buildExportBundle(args: {
  journal: JournalEntry[]
  analyses: AnalysisHistoryRecord[]
}): ExportBundle {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    journal: args.journal,
    analyses: args.analyses,
  }
}

// Triggers a browser download of `content` under `filename`.
// Type defaults to text/csv; pass application/json for the bundle.
// Browser-only; no-op on the server.
export function downloadAsFile(
  content: string,
  filename: string,
  mime = 'text/csv'
): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Best-effort cleanup; browsers tolerate not revoking but the
  // long-lived blob is wasteful otherwise.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
