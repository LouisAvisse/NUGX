// lib/journal.ts — trade journal data layer, persisted in
// localStorage. Recreated for [SPRINT-6] (the original was deleted
// in commit [#44] when the journal feature was retired); the
// JournalPanel component reintroduces it with a MEMORY tab on top.
//
// Storage key + record shape match the .claude/context.md
// "Trade journal" section so any old data still parses cleanly.
//
// CLIENT-ONLY. window.localStorage isn't available on the server;
// every function here returns a safe default when it can't read
// from storage.

import type { JournalEntry, TradeDirection } from '@/lib/types'

// Single localStorage key — same as the spec / pre-[#44] code.
const STORAGE_KEY = 'goldDashboard_journal'

// Cap on entries kept locally. Display is "last 10" but we keep
// more so a few un-closed trades don't fall out of history.
const MAX_ENTRIES = 50

// Lot size used in P&L math. .claude/context.md anchors this at
// "100 oz" — one standard COMEX gold contract. Keep as a constant
// so a future change (mini-contract = 50 oz) is one-line.
const LOT_OUNCES = 100

// Random id helper. Mirrors lib/history.ts so the codebase has
// one convention for short stable keys.
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// [SECURITY L6] Per-record schema validator. Drop entries with
// missing or wrong-typed load-bearing fields — calculatePnL math
// otherwise silently produces NaN when entry/exit/direction get
// corrupted (other tab write, DevTools edit, future migration).
const VALID_DIRECTIONS = new Set(['LONG', 'SHORT'])
function isValidEntry(e: unknown): e is JournalEntry {
  if (!e || typeof e !== 'object') return false
  const x = e as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    typeof x.direction === 'string' &&
    VALID_DIRECTIONS.has(x.direction) &&
    typeof x.entry === 'number' &&
    Number.isFinite(x.entry) &&
    typeof x.stop === 'number' &&
    Number.isFinite(x.stop) &&
    typeof x.target === 'number' &&
    Number.isFinite(x.target) &&
    typeof x.session === 'string' &&
    typeof x.notes === 'string' &&
    typeof x.createdAt === 'string'
  )
}

// Defensive read — JSON parse failures, non-array payloads,
// missing keys, and per-record schema violations all return [].
function readAll(): JournalEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // [SECURITY L6] Per-record schema check — drop corrupted rows
    // instead of letting them poison P&L math downstream.
    return parsed.filter(isValidEntry)
  } catch {
    return []
  }
}

function writeAll(entries: JournalEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = entries.slice(0, MAX_ENTRIES)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Drop silently — the UI shouldn't crash on a quota / serialize
    // failure. The next save will overwrite anyway.
  }
}

// Public read — sorted newest first.
export function getEntries(): JournalEntry[] {
  return readAll()
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
}

// Add a new open trade. Returns the saved entry so the caller can
// reset its form / show a confirmation.
export function addEntry(args: {
  direction: TradeDirection
  entry: number
  stop: number
  target: number
  session: string
  notes: string
}): JournalEntry {
  const entry: JournalEntry = {
    id: genId(),
    direction: args.direction,
    entry: args.entry,
    stop: args.stop,
    target: args.target,
    session: args.session,
    notes: args.notes,
    createdAt: new Date().toISOString(),
  }
  const all = readAll()
  all.unshift(entry)
  writeAll(all)
  return entry
}

// Close an open trade by writing exitPrice + closedAt. Idempotent
// — calling on an already-closed entry overwrites the close.
export function closeEntry(id: string, exitPrice: number): void {
  const all = readAll()
  const idx = all.findIndex((e) => e.id === id)
  if (idx < 0) return
  all[idx] = {
    ...all[idx],
    exitPrice,
    closedAt: new Date().toISOString(),
  }
  writeAll(all)
}

// Drop an entry from the journal entirely. The journal is a
// notebook, not a ledger — the trader can correct mistakes.
export function deleteEntry(id: string): void {
  const all = readAll().filter((e) => e.id !== id)
  writeAll(all)
}

// [PHASE-5] Update trade-management state on an open entry.
// Idempotent + monotonic: only writes when the new state is more
// advanced than the current one (or the same; STOPPED and
// TIME_STOP are terminal so they don't get downgraded). Returns
// true when the entry was actually updated so the caller can
// fire a notification on first transition.
export function setMgmtState(
  id: string,
  next: import('@/lib/types').TradeMgmtState
): boolean {
  const all = readAll()
  const idx = all.findIndex((e) => e.id === id)
  if (idx < 0) return false
  const entry = all[idx]
  const order: import('@/lib/types').TradeMgmtState[] = [
    'INITIAL',
    'TRAIL_60',
    'PARTIAL_80',
  ]
  const prev = entry.mgmtState ?? 'INITIAL'
  // STOPPED and TIME_STOP are terminal — never overwrite.
  if (prev === 'STOPPED' || prev === 'TIME_STOP') return false
  // Monotonic ordering for the running-toward-target states.
  const prevIdx = order.indexOf(prev)
  const nextIdx = order.indexOf(next)
  const isProgression =
    prevIdx >= 0 && nextIdx > prevIdx
  const isTerminal = next === 'STOPPED' || next === 'TIME_STOP'
  if (!isProgression && !isTerminal) return false
  all[idx] = { ...entry, mgmtState: next }
  writeAll(all)
  return true
}

// Mark an mgmtState as "user has been notified" so the watcher
// doesn't re-fire the OS notification on every tick. Idempotent.
export function markMgmtNotified(
  id: string,
  state: import('@/lib/types').TradeMgmtState
): void {
  const all = readAll()
  const idx = all.findIndex((e) => e.id === id)
  if (idx < 0) return
  const entry = all[idx]
  const list = entry.mgmtNotifiedStates ?? []
  if (list.includes(state)) return
  all[idx] = { ...entry, mgmtNotifiedStates: [...list, state] }
  writeAll(all)
}

// Compute realized P&L in USD from an entry's stored fields.
// Returns 0 for an open trade (no exitPrice yet).
//
// (exit - entry) * directionMul * LOT_OUNCES
//   directionMul = +1 for LONG, -1 for SHORT
//
// .claude/context.md anchors the math; this matches it 1:1.
export function calculatePnL(entry: JournalEntry): number {
  if (entry.exitPrice === undefined) return 0
  const directionMul = entry.direction === 'LONG' ? 1 : -1
  return (entry.exitPrice - entry.entry) * directionMul * LOT_OUNCES
}

// Format a P&L value for display: "+$2,400" / "-$650".
export function formatPnL(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  const abs = Math.abs(value)
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}
