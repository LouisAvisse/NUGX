// Dashboard root — pure layout shell + page-level keyboard +
// title plumbing.
//
// Layout zones (top → bottom):
//   1. Top bar           PriceBar             48px
//   2. Signals strip     SignalsPanel         ~78px (global,
//                                              horizontal, always
//                                              visible)
//   3. Middle row        3 cols (flex-1):     fills remaining
//                          left  280px        NewsFeed (top, scrolls)
//                                              + CalendarPanel (bottom)
//                          chart flex:1       TradingViewChart
//                          right 320px        AnalysisPanel
//   4. Shortcut hints    J / R / ESC          20px
//   5. Bottom bar        BottomBar            36px
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
import CalendarPanel from '@/components/CalendarPanel'
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

  // Side-column collapse state. Each column shrinks from its
  // natural width down to 28px when collapsed, with a single
  // expand button visible. The chart fills the freed space via
  // its existing flex:1.
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  // Keep the browser-tab title in sync with the live price.
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

  // Global keyboard shortcuts. Skip when typing in inputs.
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
      {/* 1. Top bar — fixed 48px. */}
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

      {/* 2. Global signals strip — sits below PriceBar, always
            visible, full viewport width. The component owns its
            own ~78px height (2 rows of compact chips). */}
      <SignalsPanel />

      {/* 3. Middle row — 3 columns: left News+Calendar, center
            chart, right Analysis. */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Left column — News (flex-1, scrolls) + Calendar (fixed).
            Collapses to a 28px strip with an expand button. The
            whole column has overflow:hidden; NewsFeed's internal
            list scrolls. */}
        <div
          style={{
            width: leftCollapsed ? '28px' : '300px',
            minWidth: leftCollapsed ? '28px' : '300px',
            transition: 'width 0.2s ease, min-width 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: '2px',
            background: '#0a0a0a',
            borderRight: '1px solid #222222',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Toggle button — sits at the column's INNER edge
              (right side, facing the chart). One button covers
              both directions: ◀ when expanded (click to
              collapse), ▶ when collapsed (click to expand). */}
          <button
            className="terminal-btn"
            onClick={() => setLeftCollapsed((p) => !p)}
            aria-label={leftCollapsed ? 'Expand news + calendar' : 'Collapse news + calendar'}
            style={{
              position: 'absolute',
              top: leftCollapsed ? '50%' : '6px',
              right: leftCollapsed ? '4px' : '6px',
              transform: leftCollapsed ? 'translateY(-50%)' : 'none',
              zIndex: 5,
              width: '20px',
              height: '20px',
              background: '#161616',
              border: '1px solid #222222',
              color: '#999999',
              fontSize: '9px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {leftCollapsed ? '▶' : '◀'}
          </button>
          {!leftCollapsed && (
            <>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <NewsFeed />
              </div>
              <div style={{ flexShrink: 0 }}>
                <CalendarPanel />
              </div>
            </>
          )}
        </div>

        {/* Center column — chart fills remaining width. */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TradingViewChart />
        </div>

        {/* Right column — AnalysisPanel only. Same collapse
            pattern as the left column, mirrored: toggle button
            on the LEFT inner edge, ▶ when expanded (click to
            collapse rightward), ◀ when collapsed (click to
            expand leftward). */}
        <div
          data-right-column
          style={{
            width: rightCollapsed ? '28px' : '320px',
            minWidth: rightCollapsed ? '28px' : '320px',
            transition: 'width 0.2s ease, min-width 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: '2px',
            background: '#0a0a0a',
            borderLeft: '1px solid #222222',
            overflowY: rightCollapsed ? 'hidden' : 'auto',
            position: 'relative',
          }}
        >
          <button
            className="terminal-btn"
            onClick={() => setRightCollapsed((p) => !p)}
            aria-label={rightCollapsed ? 'Expand copilot' : 'Collapse copilot'}
            style={{
              position: 'absolute',
              top: rightCollapsed ? '50%' : '6px',
              left: rightCollapsed ? '4px' : '6px',
              transform: rightCollapsed ? 'translateY(-50%)' : 'none',
              zIndex: 5,
              width: '20px',
              height: '20px',
              background: '#161616',
              border: '1px solid #222222',
              color: '#999999',
              fontSize: '9px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {rightCollapsed ? '◀' : '▶'}
          </button>
          {!rightCollapsed && <AnalysisPanel />}
        </div>
      </div>

      {/* 4. Shortcut hint strip — 20px. */}
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
                color: '#888888',
                fontSize: '8px',
                padding: '1px 5px',
                letterSpacing: '0.05em',
              }}
            >
              {key}
            </span>
            <span
              style={{
                color: '#666666',
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

      {/* 5. Bottom bar — fixed 36px. */}
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
