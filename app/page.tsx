// Dashboard root — pure layout shell + page-level keyboard +
// title plumbing.
//
// Layout (desktop ≥ 1024px, top → bottom):
//   1. Top bar           PriceBar             48px
//   2. Signals strip     SignalsPanel         ~78px
//   3. Middle row        3 cols flex:1
//                          left  300px        News + Calendar (drawer)
//                          chart flex:1       TradingViewChart
//                          right 320px        Copilot AnalysisPanel (drawer)
//   4. Shortcut hints    R / analyser         20px
//   5. Bottom bar        BottomBar            36px
//
// Tablet (768-1023px):
//   - Side drawer widths shrink to 240/260px.
//   - Shortcut hints hidden (touch device assumption).
//
// Mobile (< 768px):
//   - Middle row flips to flexDirection:column with overflow-y:auto.
//   - Drawers always-on, full-width, stacked above/below the chart.
//   - Drawer-toggle buttons in PriceBar hidden.
//   - Chart pinned to a fixed 320px height.
//   - Shortcut hints hidden.
//   - SignalsPanel + BottomBar wrap their chips instead of clipping.

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
import { useBreakpoint } from '@/lib/hooks/useBreakpoint'
import { formatPrice } from '@/lib/utils'

export default function Page() {
  const goldPrice = useGoldPrice()
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'
  const isTablet = bp === 'tablet'

  // Drawer state. On mobile we ignore these and force both
  // drawers visible (the layout flips to a vertical stack).
  const [isLeftOpen, setIsLeftOpen] = useState(true)
  const [isRightOpen, setIsRightOpen] = useState(true)

  const showLeft = isMobile ? true : isLeftOpen
  const showRight = isMobile ? true : isRightOpen

  // Per-breakpoint side widths.
  const leftWidth = isMobile
    ? '100%'
    : isTablet
      ? '240px'
      : '300px'
  const rightWidth = isMobile
    ? '100%'
    : isTablet
      ? '260px'
      : '320px'

  // Browser-tab title — live price + arrow + percent for
  // background-tab visibility. French-formatted fallback.
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

  // Global keyboard shortcut: R triggers analysis.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'r' || e.key === 'R') {
        window.dispatchEvent(new CustomEvent('triggerAnalysis'))
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
        // On mobile the page itself is the scroll container; on
        // desktop/tablet we clip and let inner panels scroll.
        overflow: isMobile ? 'hidden' : 'hidden',
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
          isLeftOpen={isLeftOpen}
          isRightOpen={isRightOpen}
          onLeftToggle={() => setIsLeftOpen((prev) => !prev)}
          onRightToggle={() => setIsRightOpen((prev) => !prev)}
          isMobile={isMobile}
        />
      </div>

      {/* 2. Signals strip — flow-aware, wraps chips on narrow
            viewports instead of overflowing horizontally. */}
      <SignalsPanel />

      {/* 3. Middle row — 3 cols on desktop/tablet, single column
            stack on mobile. */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          overflow: isMobile ? 'auto' : 'hidden',
        }}
      >
        {/* Left drawer */}
        <div
          style={{
            width: showLeft ? leftWidth : '0px',
            minWidth: showLeft ? leftWidth : '0px',
            transition: isMobile
              ? 'none'
              : 'width 0.25s ease, min-width 0.25s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: showLeft ? '2px' : 0,
            background: '#0a0a0a',
            borderRight: !isMobile && showLeft ? '1px solid #222222' : 'none',
            borderBottom: isMobile && showLeft ? '1px solid #222222' : 'none',
            overflow: 'hidden',
            // On mobile the drawer becomes a stack item with a
            // bounded height so the chart still fits below.
            maxHeight: isMobile ? '50vh' : 'none',
            flexShrink: 0,
          }}
        >
          {showLeft && (
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

        {/* Center — chart fills remaining width on desktop/tablet,
            fixed 320px height on mobile. */}
        <div
          style={{
            flex: isMobile ? 'none' : 1,
            height: isMobile ? '320px' : 'auto',
            minHeight: isMobile ? '320px' : 0,
            overflow: 'hidden',
          }}
        >
          <TradingViewChart />
        </div>

        {/* Right drawer */}
        <div
          data-right-column
          style={{
            width: showRight ? rightWidth : '0px',
            minWidth: showRight ? rightWidth : '0px',
            transition: isMobile
              ? 'none'
              : 'width 0.25s ease, min-width 0.25s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: showRight ? '2px' : 0,
            background: '#0a0a0a',
            borderLeft: !isMobile && showRight ? '1px solid #222222' : 'none',
            borderTop: isMobile && showRight ? '1px solid #222222' : 'none',
            overflowY: showRight ? 'auto' : 'hidden',
            // Mobile: cap the panel so it doesn't dominate the
            // scroll, but allow internal scroll for the longer
            // Copilot card.
            maxHeight: isMobile ? '70vh' : 'none',
            flexShrink: 0,
          }}
        >
          {showRight && <AnalysisPanel />}
        </div>
      </div>

      {/* 4. Shortcut hint strip — hidden on mobile + tablet. */}
      {!isMobile && !isTablet && (
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
          {[['R', 'analyser']].map(([key, label]) => (
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
