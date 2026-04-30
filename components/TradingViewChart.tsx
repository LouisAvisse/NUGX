// TradingViewChart — center panel of the dashboard.
//
// Embeds the TradingView Advanced Chart widget via iframe rather
// than the script-injection version, so we don't need to load the
// tv.js bundle into our page or manage cleanup on unmount. The
// iframe URL is the public widget endpoint with our config baked
// into the query string:
//
//   symbol               XAUUSD
//   interval             60         (1H — day-trading default)
//   theme                dark
//   style                1          (candles)
//   locale               en
//   timezone             Europe/Paris (encoded as Europe%2FParis)
//   studies              RSI + MACD (basic studies, @-encoded)
//   hide_side_toolbar    0          (visible)
//   allow_symbol_change  0          (locked to XAUUSD)
//   withdateranges       1
//   hide_legend          0
//   saveimage            0
//   toolbarbg            111111     (matches our panel bg)
//
// The widget URL is rendered only after the component has mounted
// on the client. During SSR and the brief window before the first
// effect runs, we show a "LOADING CHART…" placeholder so the
// iframe never participates in server rendering — that avoids
// hydration warnings and keeps the build lightweight.

'use client'

import { useEffect, useState } from 'react'

// Hardcoded so the param order, the unencoded comma between studies,
// and the %2F / %40 escapes match the spec byte-for-byte. Building
// this with URLSearchParams would re-encode the comma as %2C, which
// TradingView accepts but produces a different URL than the spec.
const WIDGET_SRC =
  'https://www.tradingview.com/widgetembed/' +
  '?symbol=XAUUSD' +
  '&interval=60' +
  '&theme=dark' +
  '&style=1' +
  '&locale=en' +
  '&timezone=Europe%2FParis' +
  '&hide_side_toolbar=0' +
  '&allow_symbol_change=0' +
  '&studies=RSI%40tv-basicstudies,MACD%40tv-basicstudies' +
  '&withdateranges=1' +
  '&hide_legend=0' +
  '&saveimage=0' +
  '&toolbarbg=111111'

export default function TradingViewChart() {
  // isMounted gates the iframe so it only ever renders on the
  // client. Starts false on the server + first client render,
  // flips to true after the effect runs.
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // The `typeof window` check is belt-and-suspenders — useEffect
    // already only runs in the browser — but it's explicit and
    // matches the spec.
    if (typeof window !== 'undefined') {
      setIsMounted(true)
    }
  }, [])

  // Wrapper that fills the parent (the chart pane in app/page.tsx
  // is `flex: 1; overflow: hidden;` so 100/100 here just means
  // "fill that pane"). overflow:hidden clips any iframe artifacts
  // before the widget paints; background matches the iframe's so
  // there's no flash of a different color.
  const wrapperStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: '#0d0d0d',
  }

  // Pre-mount placeholder — keeps the pane the same color and
  // signals to the trader that something is loading rather than
  // broken.
  if (!isMounted) {
    return (
      <div style={wrapperStyle}>
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#0d0d0d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666666',
            fontSize: '11px',
            letterSpacing: '0.15em',
          }}
        >
          LOADING CHART...
        </div>
      </div>
    )
  }

  // Mounted on the client — render the actual TradingView iframe.
  return (
    <div style={wrapperStyle}>
      <iframe
        src={WIDGET_SRC}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: '#0d0d0d',
        }}
        allowFullScreen
        scrolling="no"
      />
    </div>
  )
}
