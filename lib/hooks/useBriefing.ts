// useBriefing — orchestrates the daily session briefing.
//
// Self-contained per the SPRINT-12 design (no external prop
// dependencies for upstream data — the hook fetches /api/price,
// /api/signals, /api/technicals, /api/calendar, /api/news in
// parallel inside trigger() so it doesn't matter where in the
// page tree it's called from).
//
// Behaviour:
//   - On mount: load today's briefing from localStorage. If one
//     exists, expose it directly. If not + we're inside the
//     auto-trigger window (06–09 UTC), wait 5 seconds for any
//     parallel data hooks to load, then fire trigger().
//   - On a 60-second interval: re-check shouldGenerateBriefing
//     so a trader who has the app open across the 07:00 UTC
//     boundary gets the briefing fired automatically.
//   - trigger(): fetch all 5 upstream APIs in parallel, POST to
//     /api/briefing, persist + set state on success.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getTodaysBriefing,
  saveBriefing,
  shouldGenerateBriefing,
} from '@/lib/briefing'
import { getCurrentSession } from '@/lib/session'
import type {
  CalendarResponse,
  GoldPrice,
  MarketSignals,
  NewsResponse,
  SessionBriefing,
  SessionBriefingContent,
  TechnicalsResponse,
} from '@/lib/types'

interface UseBriefingReturn {
  briefing: SessionBriefing | null
  isGenerating: boolean
  error: string | null
  trigger: () => Promise<void>
}

// Brief delay before auto-firing on mount, so the parallel data
// fetches inside trigger() see fully-warm cache rather than
// racing with the initial /api/* polls.
const STARTUP_DELAY_MS = 5000

// Auto-trigger checker cadence — once a minute is enough to catch
// the 07:00 UTC boundary within a few seconds.
const CHECK_INTERVAL_MS = 60 * 1000

// Random id helper — same convention as the other modules.
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Today's UTC date in YYYY-MM-DD form. Mirrors lib/briefing.ts;
// duplicated here so this hook stays self-contained.
function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useBriefing(): UseBriefingReturn {
  const [briefing, setBriefing] = useState<SessionBriefing | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guard against double-firing — auto trigger AND manual trigger
  // can race during the auto-window. The flag flips for the
  // duration of a single trigger() invocation.
  const triggeringRef = useRef(false)

  // Trigger — assemble the briefing POST body from /api/* and
  // call /api/briefing. Persists on success.
  const trigger = useCallback(async () => {
    if (triggeringRef.current) return
    triggeringRef.current = true
    setIsGenerating(true)
    setError(null)
    try {
      const [priceRes, signalsRes, technicalsRes, calendarRes, newsRes] =
        await Promise.all([
          window.fetch('/api/price'),
          window.fetch('/api/signals'),
          window.fetch('/api/technicals'),
          window.fetch('/api/calendar'),
          window.fetch('/api/news'),
        ])
      const [price, signals, technicals, calendar, news] = (await Promise.all([
        priceRes.json(),
        signalsRes.json(),
        technicalsRes.json(),
        calendarRes.json(),
        newsRes.json(),
      ])) as [GoldPrice, MarketSignals, TechnicalsResponse, CalendarResponse, NewsResponse]

      // Build the POST body — names match the briefing route's
      // BriefingRequest interface exactly.
      const session = getCurrentSession().name
      const body = {
        price: price.price,
        changePct: price.changePct,
        previousClose: price.prevClose,
        session,
        dxy: signals.dxy.price,
        us10y: signals.us10y.price,
        trend: technicals.indicators.trend,
        rsi: technicals.indicators.rsi,
        calendarEvents: calendar.events
          .filter((e) => e.impact === 'HIGH' && e.isUpcoming)
          .slice(0, 5)
          .map((e) => `${e.country} ${e.title} (${e.forecast || '—'})`),
        topHeadlines: news.articles.slice(0, 5).map((a) => a.title),
      }

      const briefingRes = await window.fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!briefingRes.ok) throw new Error('Briefing API failed')
      const { briefing: content } = (await briefingRes.json()) as {
        briefing: SessionBriefingContent
      }

      const record: SessionBriefing = {
        id: genId(),
        date: todayUtcDate(),
        session,
        generatedAt: new Date().toISOString(),
        content,
      }
      saveBriefing(record)
      setBriefing(record)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Briefing failed')
    } finally {
      setIsGenerating(false)
      triggeringRef.current = false
    }
  }, [])

  // Mount: load today's briefing if we have one; otherwise queue
  // the auto-trigger after a short startup delay.
  useEffect(() => {
    const existing = getTodaysBriefing()
    if (existing) {
      setBriefing(existing)
      return
    }
    if (!shouldGenerateBriefing()) return

    // 5-second delay so other API hooks have a chance to warm
    // the route caches before this one fires.
    const timer = setTimeout(() => {
      trigger()
    }, STARTUP_DELAY_MS)
    return () => clearTimeout(timer)
  }, [trigger])

  // 60-second interval auto-trigger — catches the 07:00 UTC
  // boundary for traders with the app open.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!shouldGenerateBriefing()) return
      if (triggeringRef.current) return
      trigger()
    }, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [trigger])

  return { briefing, isGenerating, error, trigger }
}
