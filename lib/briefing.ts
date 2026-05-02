// lib/briefing.ts — session-briefing storage + scheduling helpers.
//
// Once a day around London open the copilot generates a written
// briefing: overnight summary, key levels, calendar risk, session
// bias, the one thing to watch. The briefing is persisted in
// localStorage keyed by date so reopening the app mid-session
// shows the same briefing rather than firing a duplicate.
//
// CLIENT-ONLY. Defensive read/write helpers mirror the journal /
// history / alerts modules.

import type { SessionBriefing } from '@/lib/types'

const STORAGE_KEY = 'goldDashboard_briefings'

// Cap on stored briefings — one per day, keep ~a month.
const MAX_BRIEFINGS = 30

// Auto-generation window — UTC hours when shouldGenerateBriefing
// returns true. London open is 07:00 UTC; we accept 06:00–09:00
// so a trader opening the app a bit late still gets a briefing.
// The lower bound is strict: under 06 UTC is Tokyo session and
// the briefing would be too early to be useful.
const GEN_WINDOW_START_UTC_HOUR = 6
const GEN_WINDOW_END_UTC_HOUR = 9

// Today's UTC date in YYYY-MM-DD form. Used both as the storage
// key inside a briefing record and as the boundary for "have we
// already generated today?" — anchored to UTC so day-rollover
// is unambiguous regardless of the trader's local timezone.
function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

// [SECURITY L6] Per-record schema validator. Drop briefings with
// missing or wrong-typed load-bearing fields — getTodaysBriefing
// finds by `date`, shouldGenerateBriefing falls back to it; a
// corrupt date or missing content otherwise silently breaks the
// "have we already generated today?" check.
function isValidBriefing(b: unknown): b is SessionBriefing {
  if (!b || typeof b !== 'object') return false
  const x = b as Record<string, unknown>
  if (
    typeof x.id !== 'string' ||
    typeof x.date !== 'string' ||
    typeof x.session !== 'string' ||
    typeof x.generatedAt !== 'string' ||
    !x.content ||
    typeof x.content !== 'object'
  ) {
    return false
  }
  const c = x.content as Record<string, unknown>
  return (
    typeof c.overnightSummary === 'string' &&
    typeof c.keyLevels === 'string' &&
    typeof c.calendarRisk === 'string' &&
    typeof c.sessionBias === 'string' &&
    typeof c.watchFor === 'string' &&
    typeof c.bias === 'string' &&
    typeof c.confidence === 'string'
  )
}

function readAll(): SessionBriefing[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // [SECURITY L6] Drop schema-invalid briefings — they'd otherwise
    // cause the auto-generation check to misfire.
    return parsed.filter(isValidBriefing)
  } catch {
    return []
  }
}

function writeAll(briefings: SessionBriefing[]): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = briefings.slice(0, MAX_BRIEFINGS)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Drop silently — the next save will overwrite anyway.
  }
}

// Public read — newest first.
export function getBriefingHistory(): SessionBriefing[] {
  return readAll()
    .slice()
    .sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    )
}

// Today's briefing if one exists. Returns null when nothing yet
// — the hook then decides whether to auto-generate.
export function getTodaysBriefing(): SessionBriefing | null {
  const today = todayUtcDate()
  return readAll().find((b) => b.date === today) ?? null
}

// Persist a new briefing. Trims to MAX_BRIEFINGS oldest-first.
export function saveBriefing(briefing: SessionBriefing): void {
  const all = readAll()
  // De-duplicate — if today's already has a briefing, replace it.
  // (Manual triggers + auto triggers can both land in the same
  // window; treat the latter as a refresh.)
  const filtered = all.filter((b) => b.date !== briefing.date)
  filtered.unshift(briefing)
  writeAll(filtered)
}

// Should the auto-trigger fire right now? Three conditions:
//   1. UTC hour is in [GEN_WINDOW_START, GEN_WINDOW_END).
//   2. We haven't already saved a briefing for today.
//   3. NOT during 0–6 UTC (covered by the window check above
//      but called out explicitly per the spec — Tokyo is too
//      early for a London-session briefing).
export function shouldGenerateBriefing(): boolean {
  if (typeof window === 'undefined') return false
  const now = new Date()
  const hour = now.getUTCHours()
  if (hour < GEN_WINDOW_START_UTC_HOUR) return false
  if (hour >= GEN_WINDOW_END_UTC_HOUR) return false
  return getTodaysBriefing() === null
}
