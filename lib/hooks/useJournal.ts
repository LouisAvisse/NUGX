// useJournal — React state mirror over the localStorage journal.
//
// Components should ALWAYS go through this hook rather than
// touching lib/journal.ts directly so the React state stays in
// sync after every write. Each mutator (addEntry / closeEntry /
// removeEntry) writes to localStorage then calls refresh() to
// re-read the top-10 into state.
//
// All mutators are memoized via useCallback so consumers can
// safely pass them into deps arrays without causing render
// thrash.

import { useState, useEffect, useCallback } from 'react'
import type { JournalEntry, TradeDirection } from '@/lib/types'
import {
  saveEntry,
  updateEntry,
  deleteEntry,
  generateId,
  getLastEntries,
} from '@/lib/journal'

// Inputs to addEntry — the subset of JournalEntry fields the
// caller has to supply. id / createdAt are filled in by the hook.
interface NewEntryInput {
  direction: TradeDirection
  entry: number
  stop: number
  target: number
  session: string
  notes: string
}

interface UseJournalReturn {
  entries: JournalEntry[]
  addEntry: (input: NewEntryInput) => void
  closeEntry: (id: string, exitPrice: number) => void
  removeEntry: (id: string) => void
  refresh: () => void
}

export function useJournal(): UseJournalReturn {
  const [entries, setEntries] = useState<JournalEntry[]>([])

  // Pull the top-10 from localStorage and push into state.
  // Called on mount and after every mutation.
  const refresh = useCallback(() => {
    setEntries(getLastEntries(10))
  }, [])

  // Initial sync on mount. Always [] on SSR (the storage layer
  // returns [] when window is undefined), real data appears on
  // client hydration.
  useEffect(() => {
    refresh()
  }, [refresh])

  const addEntry = useCallback(
    (input: NewEntryInput) => {
      const entry: JournalEntry = {
        id: generateId(),
        direction: input.direction,
        entry: input.entry,
        stop: input.stop,
        target: input.target,
        session: input.session,
        notes: input.notes,
        createdAt: new Date().toISOString(),
      }
      saveEntry(entry)
      refresh()
    },
    [refresh]
  )

  const closeEntry = useCallback(
    (id: string, exitPrice: number) => {
      updateEntry(id, {
        exitPrice,
        closedAt: new Date().toISOString(),
      })
      refresh()
    },
    [refresh]
  )

  const removeEntry = useCallback(
    (id: string) => {
      deleteEntry(id)
      refresh()
    },
    [refresh]
  )

  return { entries, addEntry, closeEntry, removeEntry, refresh }
}
