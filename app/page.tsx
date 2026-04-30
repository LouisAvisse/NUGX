// Dashboard root — pure layout shell + page-level keyboard +
// title plumbing.
//
// Layout zones (top → bottom):
//   1. Top bar           PriceBar         48px
//   2. Middle row        Chart + sidebar  flex-1
//   3. Shortcut hints    J / R / ESC       20px
//   4. Bottom bar        BottomBar        36px
//
// Keyboard shortcuts (handled at page level, ignore typing):
//   J / j   → toggle the journal overlay
//   ESC     → close the journal overlay
//   R / r   → trigger a fresh AI analysis (CustomEvent
//             'triggerAnalysis' that AnalysisPanel listens for)
//
// Dynamic browser title — useGoldPrice is called HERE so it only
// polls once for the whole page; PriceBar receives the data as
// props (no double-polling). The title shows live price + arrow
// + change % so the trader can see the move from a background tab.

'use client'

import { useEffect, useState } from 'react'
import PriceBar from '@/components/PriceBar'
import TradingViewChart from '@/components/TradingViewChart'
import AnalysisPanel from '@/components/AnalysisPanel'
import SignalsPanel from '@/components/SignalsPanel'
import NewsFeed from '@/components/NewsFeed'
import BottomBar from '@/components/BottomBar'
import { useGoldPrice } from '@/lib/hooks/useGoldPrice'
import { formatPrice } from '@/lib/utils'

export default function Page() {
  // Single useGoldPrice instance for the whole page — feeds both
  // the browser-tab title (here) and the PriceBar (passed as props).
  const goldPrice = useGoldPrice()

  // Journal overlay state lifted up here so the J / ESC shortcuts
  // can drive it without prop-drilling through PriceBar's button.
  const [isJournalOpen, setIsJournalOpen] = useState(false)

  // Keep the browser-tab title in sync with the live price. While
  // the page is in a background tab, this is the only signal the
  // trader sees; the arrow + signed % gives direction at a glance.
  useEffect(() => {
    if (!goldPrice.data) {
      document.title = 'XAU/USD — Gold Terminal'
      return
    }
    const price = formatPrice(goldPrice.data.price)
    const pct = goldPrice.data.changePct
    const sign = pct >= 0 ? '+' : ''
    const arrow = pct >= 0 ? '▲' : '▼'
    document.title = `${arrow} ${price} (${sign}${pct.toFixed(2)}%) — XAU/USD`
  }, [goldPrice.data?.price, goldPrice.data?.changePct, goldPrice.data])

  // Global keyboard shortcuts. Skip when the user is typing in an
  // input/textarea so the journal form keystrokes don't fire J/R.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.key) {
        case 'j':
        case 'J':
          setIsJournalOpen((prev) => !prev)
          break
        case 'Escape':
          setIsJournalOpen(false)
          break
        case 'r':
        case 'R':
          // AnalysisPanel listens for this via window.addEventListener.
          // CustomEvent keeps the shortcut decoupled from the panel's
          // mount tree — it works whether or not the panel is in the
          // current viewport.
          window.dispatchEvent(new CustomEvent('triggerAnalysis'))
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <main
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: '#0a0a0a',
      }}
    >
      {/* 1. Top bar — fixed 48px, panel bg #111, divider #222. */}
      <div
        style={{
          height: '48px',
          minHeight: '48px',
          background: '#111111',
          borderBottom: '1px solid #222222',
        }}
      >
        <PriceBar
          data={goldPrice.data}
          loading={goldPrice.loading}
          error={goldPrice.error}
          isJournalOpen={isJournalOpen}
          onJournalToggle={() => setIsJournalOpen((prev) => !prev)}
          onJournalClose={() => setIsJournalOpen(false)}
        />
      </div>

      {/* 2. Middle row — chart left, sidebar right. */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TradingViewChart />
        </div>

        <div
          style={{
            width: '300px',
            minWidth: '300px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: '2px',
            background: '#0a0a0a',
            borderLeft: '1px solid #222222',
            overflow: 'hidden',
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <AnalysisPanel />
          </div>
          <div style={{ flexShrink: 0 }}>
            <SignalsPanel />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <NewsFeed />
          </div>
        </div>
      </div>

      {/* 3. Shortcut hint strip — 20px, between middle row and
            BottomBar. Each entry is a small key chip + label so
            the trader sees the shortcuts without having to
            memorize them. */}
      <div
        style={{
          height: '20px',
          minHeight: '20px',
          background: '#0a0a0a',
          borderTop: '1px solid #161616',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '20px',
        }}
      >
        {[
          ['J', 'journal'],
          ['R', 'run analysis'],
          ['ESC', 'close'],
        ].map(([key, label]) => (
          <div
            key={key}
            style={{
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                background: '#161616',
                border: '1px solid #222222',
                color: '#444444',
                fontSize: '8px',
                padding: '1px 5px',
                letterSpacing: '0.05em',
              }}
            >
              {key}
            </span>
            <span
              style={{
                color: '#333333',
                fontSize: '8px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* 4. Bottom bar — fixed 36px, panel bg #111, divider #222. */}
      <div
        style={{
          height: '36px',
          minHeight: '36px',
          background: '#111111',
          borderTop: '1px solid #222222',
        }}
      >
        <BottomBar />
      </div>
    </main>
  )
}
