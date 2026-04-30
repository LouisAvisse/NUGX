// Dashboard root — pure layout shell.
// Five zones, no data, no logic:
//   1. Top bar          (PriceBar)        — fixed 48px, dark panel
//   2. Center chart     (TradingViewChart)— flex-1 of the middle row
//   3. Right column     (AnalysisPanel +  — fixed 300px wide
//                        SignalsPanel +
//                        NewsFeed)
//   4. Bottom bar       (BottomBar)       — fixed 36px, dark panel
// `'use client'` is set because the upcoming polling hooks
// (useGoldPrice / useSignals / useNews / useAnalysis) will run in
// the browser; declaring the boundary here keeps every dashboard
// child component on the client side.

'use client'

import PriceBar from '@/components/PriceBar'
import TradingViewChart from '@/components/TradingViewChart'
import AnalysisPanel from '@/components/AnalysisPanel'
import SignalsPanel from '@/components/SignalsPanel'
import NewsFeed from '@/components/NewsFeed'
import BottomBar from '@/components/BottomBar'

export default function Page() {
  return (
    // Full-viewport flex column. `overflow: hidden` clips any
    // accidental child overflow so the inner panels can manage
    // their own scrolling (NewsFeed in particular).
    <main style={{
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0a0a',
    }}>

      {/* Top bar — fixed 48px, panel bg #111, divider #222. */}
      <div style={{
        height: '48px',
        minHeight: '48px',
        background: '#111111',
        borderBottom: '1px solid #222222',
      }}>
        <PriceBar />
      </div>

      {/* Middle row — fills remaining height; chart left, sidebar right. */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>

        {/* Chart — takes all remaining width. */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TradingViewChart />
        </div>

        {/* Right column — fixed 300px. AnalysisPanel and SignalsPanel
            stay at their natural height (flexShrink:0); NewsFeed
            takes the leftover space and scrolls internally. */}
        <div style={{
          width: '300px',
          minWidth: '300px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          padding: '2px',
          background: '#0a0a0a',
          borderLeft: '1px solid #222222',
          overflow: 'hidden',
        }}>
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

      {/* Bottom bar — fixed 36px, panel bg #111, divider #222. */}
      <div style={{
        height: '36px',
        minHeight: '36px',
        background: '#111111',
        borderTop: '1px solid #222222',
      }}>
        <BottomBar />
      </div>

    </main>
  )
}
