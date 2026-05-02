// Dashboard root — pure layout shell + page-level keyboard +
// title plumbing.
//
// Layout (desktop ≥ 1024px, top → bottom):
//   1. Top bar           PriceBar             48px
//   2. Signals strip     SignalsPanel         ~58px (horizontal scroll)
//   3. Middle row        3 cols flex:1
//                          left  300px        News + Calendar (drawer)
//                          chart flex:1       TradingViewChart
//                          right 320px        Copilot AnalysisPanel (drawer)
//   4. Shortcut hints    R / analyser         20px
//   5. Bottom bar        BottomBar            36px
//
// Stacked layout (mobile + tablet, < 1024px):
//   The middle row flips to a vertical column with overflow-y:auto.
//   Children re-order via CSS `order` to match the touch-trader's
//   priority: chart first, then Copilot recommendations, then
//   the news+calendar context.
//
//     1. Chart                  (order: 1)
//     2. Copilot AnalysisPanel  (order: 2)
//     3. News + Calendar drawer (order: 3)
//
//   Both drawers force-open in stacked mode (the toggle chips in
//   PriceBar hide). Per-breakpoint chart height keeps the chart
//   prominent on phones (~280px) and even more so on iPads
//   (~420px) without dominating the scroll.

'use client'

import { useCallback, useEffect, useState } from 'react'
import PriceBar from '@/components/PriceBar'
import TradingViewChart from '@/components/TradingViewChart'
import AnalysisPanel from '@/components/AnalysisPanel'
import SignalsPanel from '@/components/SignalsPanel'
import CalendarPanel from '@/components/CalendarPanel'
import NewsFeed from '@/components/NewsFeed'
import BottomBar from '@/components/BottomBar'
import JournalPanel from '@/components/JournalPanel'
import { useGoldPrice } from '@/lib/hooks/useGoldPrice'
import { useBreakpoint } from '@/lib/hooks/useBreakpoint'
import { formatPrice } from '@/lib/utils'
import type { ChartLevels } from '@/lib/types'

export default function Page() {
  const goldPrice = useGoldPrice()
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'
  const isTablet = bp === 'tablet'
  // Anything not desktop uses the stacked layout. iPad portrait
  // (~768-820px) and even iPad landscape near the breakpoint
  // benefit from a vertical scroll over a cramped 3-column grid.
  const isStacked = bp !== 'desktop'

  // Drawer state. On stacked layouts both drawers are forced
  // visible (the order property does the rearranging).
  const [isLeftOpen, setIsLeftOpen] = useState(true)
  const [isRightOpen, setIsRightOpen] = useState(true)

  // [SPRINT-6] JournalPanel slide-in overlay. Toggled by the J key
  // and (when added) the JOURNAL chip in PriceBar; ESC closes it.
  const [isJournalOpen, setIsJournalOpen] = useState(false)

  // AI levels lifted from AnalysisPanel so GoldChart can overlay
  // entry/stop/target/resistance/support as horizontal price
  // lines. AnalysisPanel calls setChartLevels after each
  // successful analysis run; GoldChart redraws when the prop
  // identity changes. useCallback stabilizes the setter so the
  // child effect doesn't re-fire on every render.
  const [chartLevels, setChartLevels] = useState<ChartLevels | undefined>(
    undefined
  )
  const handleLevelsUpdate = useCallback((levels: ChartLevels) => {
    setChartLevels(levels)
  }, [])

  const showLeft = isStacked ? true : isLeftOpen
  const showRight = isStacked ? true : isRightOpen

  // Side widths only matter when not stacked. Stack mode uses
  // 100% per panel.
  const leftWidth = isStacked
    ? '100%'
    : isTablet
      ? '240px'
      : '300px'
  const rightWidth = isStacked
    ? '100%'
    : isTablet
      ? '260px'
      : '320px'

  // Per-breakpoint chart height when stacked. Phones get a
  // tighter chart so the Copilot card is reachable in one
  // thumb-scroll; iPads get a generous one because the chart
  // is the primary surface for technical reads.
  const chartHeight = isMobile ? '280px' : isTablet ? '420px' : 'auto'

  // Browser-tab title — live price + arrow + percent for
  // background-tab visibility.
  useEffect(() => {
    if (!goldPrice.data) {
      document.title = 'NUGX — Terminal XAU/USD'
      return
    }
    const price = formatPrice(goldPrice.data.price)
    const pct = goldPrice.data.changePct
    const sign = pct >= 0 ? '+' : ''
    const arrow = pct >= 0 ? '▲' : '▼'
    document.title = `${arrow} ${price} (${sign}${pct.toFixed(2)}%) — XAU/USD`
  }, [goldPrice.data?.price, goldPrice.data?.changePct, goldPrice.data])

  // Global keyboard shortcuts:
  //   R          → trigger analysis (CustomEvent → AnalysisPanel)
  //   J / Shift+J → toggle JournalPanel
  //   ESC        → close JournalPanel if open
  // INPUT/TEXTAREA targets are ignored so typing in the journal
  // form doesn't fire shortcuts on every keystroke.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'r' || e.key === 'R') {
        window.dispatchEvent(new CustomEvent('triggerAnalysis'))
      } else if (e.key === 'j' || e.key === 'J') {
        setIsJournalOpen((prev) => !prev)
      } else if (e.key === 'Escape') {
        setIsJournalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <main
      data-section="page-root"
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
        data-section="topbar-wrapper"
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
          isLeftOpen={isLeftOpen}
          isRightOpen={isRightOpen}
          onLeftToggle={() => setIsLeftOpen((prev) => !prev)}
          onRightToggle={() => setIsRightOpen((prev) => !prev)}
          isStacked={isStacked}
        />
      </div>

      {/* 2. Signals strip — always horizontal, scrolls when narrow. */}
      <SignalsPanel />

      {/* 3. Middle row — 3 cols on desktop, vertical stack
            (chart → copilot → news+calendar) on mobile + tablet. */}
      <div
        data-section="middle-row"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: isStacked ? 'column' : 'row',
          overflow: isStacked ? 'auto' : 'hidden',
        }}
      >
        {/* LEFT drawer — News + Calendar.
            Source order keeps it first to match the desktop
            layout; CSS `order` pushes it to LAST when stacked. */}
        <div
          data-section="left-drawer"
          style={{
            width: showLeft ? leftWidth : '0px',
            minWidth: showLeft ? leftWidth : '0px',
            transition: isStacked
              ? 'none'
              : 'width 0.25s ease, min-width 0.25s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: showLeft ? '2px' : 0,
            background: '#0a0a0a',
            borderRight: !isStacked && showLeft ? '1px solid #222222' : 'none',
            borderTop: isStacked && showLeft ? '1px solid #222222' : 'none',
            overflow: 'hidden',
            // On stacked layouts let the drawer take its natural
            // height (NewsFeed scrolls internally on its own).
            // The page-level overflow handles vertical scroll.
            flexShrink: 0,
            order: isStacked ? 3 : 0,
          }}
        >
          {showLeft && (
            <>
              <div
                style={{
                  flex: 1,
                  // On stack mode, NewsFeed takes a bounded
                  // height so the calendar below it is always
                  // visible without scrolling THROUGH it.
                  minHeight: isStacked ? '320px' : 0,
                  overflow: 'hidden',
                }}
              >
                <NewsFeed />
              </div>
              <div style={{ flexShrink: 0 }}>
                <CalendarPanel />
              </div>
            </>
          )}
        </div>

        {/* CENTER — chart. flex:1 on desktop, fixed height on stack. */}
        <div
          data-section="chart"
          style={{
            flex: isStacked ? 'none' : 1,
            height: chartHeight,
            minHeight: isStacked ? chartHeight : 0,
            overflow: 'hidden',
            order: isStacked ? 1 : 0,
          }}
        >
          <TradingViewChart levels={chartLevels} />
        </div>

        {/* RIGHT drawer — Copilot AnalysisPanel. */}
        <div
          data-section="right-drawer"
          data-right-column
          style={{
            width: showRight ? rightWidth : '0px',
            minWidth: showRight ? rightWidth : '0px',
            transition: isStacked
              ? 'none'
              : 'width 0.25s ease, min-width 0.25s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: showRight ? '2px' : 0,
            background: '#0a0a0a',
            borderLeft: !isStacked && showRight ? '1px solid #222222' : 'none',
            borderTop: isStacked && showRight ? '1px solid #222222' : 'none',
            overflowY: showRight && !isStacked ? 'auto' : 'visible',
            flexShrink: 0,
            order: isStacked ? 2 : 0,
          }}
        >
          {showRight && <AnalysisPanel onLevelsUpdate={handleLevelsUpdate} />}
        </div>
      </div>

      {/* 4. Shortcut hint strip — desktop only.
            Tablets / phones are touch-first, no keyboard. */}
      {!isStacked && (
        <div
          data-section="shortcut-hints"
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
            ['R', 'analyser'],
            ['J', 'journal'],
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
      )}

      {/* 5. Bottom bar — fixed 36px. */}
      <div
        data-section="bottombar-wrapper"
        style={{
          height: '36px',
          minHeight: '36px',
          background: '#111111',
          borderTop: '1px solid #222222',
        }}
      >
        <BottomBar />
      </div>

      {/* [SPRINT-6] JournalPanel slide-in overlay. Renders nothing
          when isJournalOpen is false; otherwise the fixed-position
          overlay paints on top of the dashboard. */}
      <JournalPanel
        isOpen={isJournalOpen}
        onClose={() => setIsJournalOpen(false)}
      />
    </main>
  )
}
