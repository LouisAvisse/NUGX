// useJournal — read-and-mutate hook for the trade journal stored
// in localStorage. Wraps lib/journal.ts so React components stay
// declarative. Recreated for [SPRINT-6]; the original was deleted
// in [#44] alongside the journal panel.
//
// CLIENT-ONLY. Reads localStorage on mount; every mutation
// writes back synchronously and refreshes local state.

'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  addEntry as addEntryToStorage,
  closeEntry as closeEntryInStorage,
  deleteEntry as deleteEntryFromStorage,
  getEntries,
} from '@/lib/journal'
import type { JournalEntry, TradeDirection } from '@/lib/types'

interface UseJournalReturn {
  entries: JournalEntry[]
  addEntry: (args: {
    direction: TradeDirection
    entry: number
    stop: number
    target: number
    session: string
    notes: string
  }) => void
  closeEntry: (id: string, exitPrice: number) => void
  deleteEntry: (id: string) => void
  refresh: () => void
}

export function useJournal(): UseJournalReturn {
  const [entries, setEntries] = useState<JournalEntry[]>([])

  // Single state-mutation primitive — re-read storage and re-set
  // local state. Wrapped in useCallback so it's a stable dep for
  // the effect that subscribes to cross-component refresh events.
  const refresh = useCallback(() => {
    setEntries(getEntries())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addEntry = useCallback(
    (args: {
      direction: TradeDirection
      entry: number
      stop: number
      target: number
      session: string
      notes: string
    }) => {
      addEntryToStorage(args)
      refresh()
    },
    [refresh]
  )

  const closeEntry = useCallback(
    (id: string, exitPrice: number) => {
      closeEntryInStorage(id, exitPrice)
      refresh()
    },
    [refresh]
  )

  const deleteEntry = useCallback(
    (id: string) => {
      deleteEntryFromStorage(id)
      refresh()
    },
    [refresh]
  )

  return { entries, addEntry, closeEntry, deleteEntry, refresh }
}
