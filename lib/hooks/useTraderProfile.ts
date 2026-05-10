// useTraderProfile — [PHASE-12.4] persists position-sizing inputs.
//
// Two fields, both saved to localStorage so the trader doesn't
// re-type their account size every session:
//
//   accountSize  — USD balance (default 10_000)
//   riskPct      — % of account willing to lose per trade (default 0.5)
//
// Cross-tab sync via the storage event so two-tab users stay in
// sync. Returns the profile + a single setter that merges and
// persists.

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_TRADER_PROFILE,
  type TraderProfile,
} from '@/lib/positionSizing'

const STORAGE_KEY = 'goldDashboard_traderProfile'

function load(): TraderProfile {
  if (typeof window === 'undefined') return { ...DEFAULT_TRADER_PROFILE }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TRADER_PROFILE }
    const parsed = JSON.parse(raw) as Partial<TraderProfile>
    return {
      accountSize:
        typeof parsed.accountSize === 'number' && parsed.accountSize > 0
          ? parsed.accountSize
          : DEFAULT_TRADER_PROFILE.accountSize,
      riskPct:
        typeof parsed.riskPct === 'number' && parsed.riskPct > 0
          ? parsed.riskPct
          : DEFAULT_TRADER_PROFILE.riskPct,
    }
  } catch {
    return { ...DEFAULT_TRADER_PROFILE }
  }
}

function save(profile: TraderProfile): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Quota / private mode — ignore.
  }
}

interface UseTraderProfileReturn {
  profile: TraderProfile
  setProfile: (next: Partial<TraderProfile>) => void
}

export function useTraderProfile(): UseTraderProfileReturn {
  const [profile, setProfileState] = useState<TraderProfile>(() => load())

  // Cross-tab sync.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setProfileState(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setProfile = useCallback(
    (next: Partial<TraderProfile>) => {
      const merged = {
        ...profile,
        ...next,
        // Clamp at sensible bounds so a stray paste of "-0.5" or
        // "1000000000" doesn't break the math downstream.
        accountSize:
          typeof next.accountSize === 'number' && next.accountSize > 0
            ? Math.min(next.accountSize, 100_000_000)
            : profile.accountSize,
        riskPct:
          typeof next.riskPct === 'number' && next.riskPct > 0
            ? Math.min(next.riskPct, 100)
            : profile.riskPct,
      }
      save(merged)
      setProfileState(merged)
    },
    [profile]
  )

  return { profile, setProfile }
}
