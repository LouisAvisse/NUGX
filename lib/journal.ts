// lib/journal.ts — trade journal persistence layer.
//
// Stores JournalEntry records in localStorage under a single
// JSON-encoded array. All public functions are SSR-safe via
// `typeof window` guards so they can be imported into shared
// modules without breaking server rendering — the guards
// no-op on the server and run normally in the browser.
//
// Storage key documented in .claude/context.md:
//   localStorage["goldDashboard_journal"] = JSON(JournalEntry[])
//
// Entries are kept newest-first (unshift on save) so the
// 10-most-recent slice in getLastEntries() is just `slice(0, n)`.

import type { JournalEntry, TradeDirection } from '@/lib/types'

const STORAGE_KEY = 'goldDashboard_journal'

// Read the full journal. Returns [] on SSR, missing key, or
// parse error so consumers always get a usable array.
export function getEntries(): JournalEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as JournalEntry[]
  } catch {
    return []
  }
}

// Prepend a new entry. Newest-first ordering matches the UI's
// "last 10" display.
export function saveEntry(entry: JournalEntry): void {
  if (typeof window === 'undefined') return
  try {
    const entries = getEntries()
    entries.unshift(entry)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    console.error('[journal] failed to save entry')
  }
}

// Patch a single entry by id. Used to record exitPrice +
// closedAt when a trade is closed.
export function updateEntry(
  id: string,
  updates: Partial<JournalEntry>
): void {
  if (typeof window === 'undefined') return
  try {
    const entries = getEntries()
    const index = entries.findIndex((e) => e.id === id)
    if (index === -1) return
    entries[index] = { ...entries[index], ...updates }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    console.error('[journal] failed to update entry')
  }
}

// Hard-delete an entry. No soft-delete — it's a personal log,
// not a reportable record.
export function deleteEntry(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const entries = getEntries().filter((e) => e.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    console.error('[journal] failed to delete entry')
  }
}

// Collision-resistant id without pulling in a uuid dep:
// base36 timestamp + 5 random base36 chars.
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// P&L math for a 100oz lot (the standard XAU/USD lot size per
// .claude/context.md). LONG profits when exit > entry; SHORT
// profits when exit < entry — handled by the direction
// multiplier.
export function calculatePnL(
  entry: number,
  exitPrice: number,
  direction: TradeDirection
): number {
  const multiplier = direction === 'LONG' ? 1 : -1
  return (exitPrice - entry) * multiplier * 100
}

// Format a P&L number for display: "+$123.45" / "-$67.80".
// Sign is always present so the trader spots winners/losers
// at a glance.
export function formatPnL(pnl: number): string {
  const sign = pnl >= 0 ? '+' : ''
  return `${sign}$${pnl.toFixed(2)}`
}

// Last N entries, newest first. Default 10 matches the UI cap.
export function getLastEntries(n: number = 10): JournalEntry[] {
  return getEntries().slice(0, n)
}
