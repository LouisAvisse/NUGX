# Gold Trading Dashboard — Project Context

## Purpose
Personal day trading dashboard for XAU/USD. Gives the trader a live
price feed, TradingView chart, macro signals, curated gold/macro news,
and an AI-powered trade analysis (bias, key levels, entry/stop/target).
This is a local-first tool, built for daily personal use during trading
sessions. Not a commercial product.

## Stack
- Next.js 15, App Router, TypeScript, Tailwind CSS
- Geist Mono as primary font — this is a terminal, not a website
- Anthropic Claude API (claude-sonnet-4-20250514) for trade analysis
- gold-api.com for live XAU/USD price (free, no key, no rate limit)
- yahoo-finance2 npm package for DXY + US10Y (server-side only)
- newsdata.io for gold/macro news (free tier, key in .env.local)
- TradingView widget via iframe for the main chart

## Architecture rules
- All external API calls go through Next.js API routes — never
  call third-party APIs from the client directly
- Shared TypeScript types live exclusively in lib/types.ts —
  always import from there, never redefine locally
- Each component owns its own display logic, data fetching is
  handled by hooks in lib/hooks/
- .env.local holds all API keys — never hardcode, never commit
- yahoo-finance2 is server-side only — never import in client
  components or it will break the build

## Design system
- Background: #0a0a0a (page), #111111 (panels), #161616 (cards)
- Borders: #222222 (default), #2a2a2a (hover)
- Text: #e5e5e5 (primary), #888888 (muted), #444444 (tertiary)
- Bull / green: #4ade80
- Bear / red: #f87171
- Neutral / amber: #fbbf24
- Info / blue: #60a5fa
- Font: Geist Mono throughout — apply via CSS variable --font-mono
- Border radius: 4px max — this is a terminal, not a card UI
- No shadows, no gradients, no rounded card aesthetics
- Spacing unit: 8px base grid

## File structure

```
app/
  page.tsx                  — main dashboard, layout only
  api/
    price/route.ts          — fetches XAU/USD from gold-api.com
    signals/route.ts        — fetches DXY + US10Y via yahoo-finance2
    news/route.ts           — fetches from newsdata.io
    analyze/route.ts        — calls Anthropic Claude API
components/
  PriceBar.tsx              — top bar: price, change, high/low, session
  TradingViewChart.tsx      — iframe wrapper for TradingView widget
  AnalysisPanel.tsx         — AI bias, levels, entry/stop, catalyst
  SignalsPanel.tsx          — DXY, US10Y, RSI, trend, volume
  NewsFeed.tsx              — scrollable news list with impact badges
  BottomBar.tsx             — open, prev close, 52W high/low, last analysis
lib/
  types.ts                  — all shared TypeScript interfaces
  hooks/
    useGoldPrice.ts         — polls /api/price every 30s
    useSignals.ts           — polls /api/signals every 60s
    useNews.ts              — polls /api/news every 15min
    useAnalysis.ts          — calls /api/analyze, manages state
  session.ts                — trading session detection logic
  utils.ts                  — shared formatters (price, %, time)
```

## Environment variables

```
ANTHROPIC_API_KEY=          — Claude API key
NEWSDATA_API_KEY=           — newsdata.io free tier key
```

## API contracts

### GET /api/price
Returns:
```json
{
  "price": 3285.40,
  "change": 12.30,
  "changePct": 0.38,
  "high": 3301.00,
  "low": 3271.50,
  "open": 3273.10,
  "prevClose": 3273.10,
  "timestamp": 1714123456000
}
```

### GET /api/signals
Returns:
```json
{
  "dxy":  { "price": 104.23, "change": -0.12, "changePct": -0.11 },
  "us10y": { "price": 4.28, "change": 0.03, "changePct": 0.71 }
}
```

### GET /api/news
Returns:
```json
{
  "articles": [
    {
      "title": "string",
      "source": "string",
      "publishedAt": "ISO string",
      "url": "string",
      "impact": "HIGH" | "MEDIUM" | "LOW"
    }
  ]
}
```

### POST /api/analyze
Body:
```json
{
  "price": 3285.40,
  "changePct": 0.38,
  "high": 3301.00,
  "low": 3271.50,
  "dxy": 104.23,
  "us10y": 4.28,
  "session": "London",
  "news": ["headline 1", "headline 2"]
}
```
Returns:
```json
{
  "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "recommendation": "LONG" | "SHORT" | "FLAT",
  "entry": "3280-3285",
  "stop": "3265",
  "target": "3320",
  "resistance": "3305",
  "support": "3265",
  "catalyst": "string — 2-3 sentences",
  "rationale": "string — 1 sentence",
  "generatedAt": "ISO string"
}
```

## Session logic
- Tokyo:             00:00–07:00 UTC
- London:            07:00–12:00 UTC
- NY/London overlap: 12:00–16:00 UTC — highest volatility, flag this
- New York:          16:00–21:00 UTC
- Off-hours:         21:00–00:00 UTC

## News impact tagging logic
HIGH if title contains any of:
  Fed, Federal Reserve, CPI, inflation, NFP, jobs, war, sanctions,
  rate cut, rate hike, FOMC, dollar, DXY, Treasury, yield, crisis

LOW if title contains any of:
  analyst, forecast, outlook, prediction, target, expect

Everything else: MEDIUM

## Trade journal
- Stored in localStorage key: `goldDashboard_journal`
- Each entry: `{ id, direction, entry, stop, target, session, notes, exitPrice?, createdAt, closedAt? }`
- P&L: `(exitPrice - entry) * direction (1=LONG, -1=SHORT) * 100oz lot`
- Display last 10 entries

## Analysis behavior
- Manual trigger: always available via button
- Auto trigger: every 30 minutes since last analysis
- Countdown timer visible in AnalysisPanel
- Loading state: button disabled, text shows "Analyzing..."
- Last result cached in React state until page refresh

## TradingView widget config
- Symbol: XAUUSD
- Interval: 60 (1H — day trading default)
- Theme: dark
- Studies: RSI, MACD
- Locale: en
- Timezone: Europe/Paris
- Allow symbol change: false
- Hide side toolbar: false

## Commit log
- [INIT] context.md created — project fully specced, ready to build
- [#1] Next.js 15 scaffolded — clean default project, no modifications
- [#2] Dependencies installed — geist, yahoo-finance2, @anthropic-ai/sdk
- [#3] Global styles + Geist Mono font configured
- [#4] lib/types.ts created — all shared interfaces defined
- [#5] Full file structure scaffolded — all placeholders created
- [#6] Layout grid implemented — five zones rendering correctly
- [#7] API route shells with typed mocks — all four routes returning correct shapes
- [#8] lib/session.ts + lib/utils.ts implemented — helpers ready
- [#9] All four data hooks implemented — polling intervals set, loading/error states handled
- [#10] PriceBar implemented — live price, change, high/low, session, live indicator
- [#11] TradingViewChart implemented — XAUUSD 1H dark theme, RSI + MACD
- [#12] SignalsPanel implemented — DXY, US10Y, spread, session volatility
- [#13] NewsFeed implemented — articles list, impact badges, hover states, scroll
- [#14] AnalysisPanel implemented — bias, confidence, levels, catalyst, auto-trigger every 30min
- [#15] BottomBar implemented — open, prev close, change, high/low, 52W levels, timestamp
- [#16] Real gold price wired — gold-api.com, fallback on error, no caching
- [#17] Real signals wired — DXY + US10Y via yahoo-finance2, fallback on error
- [#18] Real news wired — newsdata.io, impact auto-tagging, fallback on error
- [#19] Real Claude analysis wired — structured JSON prompt, field validation, fallback on error
- [#20] Trade journal data layer — lib/journal.ts + useJournal hook, localStorage persistence
- [#21] Trade journal UI — slide-in panel, log form, entry cards, PnL, localStorage persistence
- [#22] Error states + loading skeletons — shimmer animation, graceful fallbacks in all four components
- [#23] Micro-interactions — price flash, fade-in on data load, smooth button hover transitions
- [#25] technicalindicators package installed
- [#26] Tooltip component + applied to existing labels (PriceBar, BottomBar, SignalsPanel headers; AnalysisPanel + NewsFeed pending future-UI items)
- [#27] Schema expansion — TechnicalIndicators, EconomicEvent/CalendarResponse, NewsSentiment, SignalBreakdown; expanded AnalysisRequest + AnalysisResult; FALLBACK + buildRequest updated with safe defaults
- [#28] Technicals stack — lib/technicals.ts compute fn, /api/technicals via yahoo-finance2 GC=F 1H candles + technicalindicators package, useTechnicals hook 60s polling
- [#29] Calendar stack — /api/calendar via ForexFactory weekly JSON, gold-relevant filter, 45-min trade gate, useCalendar hook 60s polling
- [#30] News sentiment tagging — bullish/bearish gold keyword lists; sentiment field populated alongside impact in /api/news
- [#31] AnalysisPanel.buildRequest wired to useTechnicals + useCalendar — analyze body now carries real indicator + calendar values
- [#32] /api/analyze rebuilt as Marcus Reid confluence engine — 8-signal scoring, IDEAL/AGGRESSIVE/WAIT entry, NOW/RISK/TRIGGER catalyst, invalidation level, market condition, calendar gate forces FLAT
- [#33] Copilot AnalysisPanel rebuild — COPILOT header + market condition badge, calendar warning banner, large recommendation + bias/confidence stack, entryTiming + entryType badge, ENTRY/STOP/TARGET grid + R/R + HOLD + INVALIDATION, 8-block confluence bar + 8-signal grid, NOW/RISK/TRIGGER + EXIT, button states (RUN/RETRY/ANALYZING/CALENDAR BLOCK), TA timestamp footer
- [#34] Keyboard shortcuts + dynamic title — useGoldPrice lifted to page.tsx (no double-poll); J/R/ESC handlers; PriceBar accepts data + journal-state props; AnalysisPanel listens for triggerAnalysis CustomEvent; shortcut hint strip between middle row and BottomBar
- [#35] CalendarPanel — events list with countdown chips (red+pulse < 30m / amber < 60m / muted), CLEAR/BLOCKED gate indicator, F/P forecast/previous; right column scrolls vertically
- [#36] SignalsPanel TECHNICAL section — MACRO/TECHNICAL section labels; rows for RSI 14 (OB/OS badge), MACD (cross badge), TREND, EMA 20/50 (compact ▲/▼ chips), ATR 14 (HIGH/NORMAL/LOW VOL), BB BAND position, DAY RANGE progress bar
- [#37] NewsFeed sentiment UI — sentiment summary bar (BULL/BEAR/NEUT counts + flow verdict), proportional ratio bar, ALL/HIGH/BULL filter chips, per-article sentiment dot before impact badge; footer count reflects active filter
- [#38] Layout reshuffle — News+Calendar moved to LEFT column; SignalsPanel refactored to a horizontal 2-row chip strip below PriceBar (always visible globally); chart shrinks to flex:1 in the 3-column middle row; AnalysisPanel alone on the right (320px)
- [#39] Geist Sans + contrast bump + NUGX brand — switched default UI font from Geist Mono → Geist Sans (mono kept aliased for tabular numerics); systematic two-tier brightness bump on tertiary text colors (#333→#666, #444→#888, #666→#999, #888→#b0); "NUGX" wordmark added to the leftmost slot of PriceBar with a vertical divider
- [#40] Tooltip viewport clamp + collapsible side columns — Tooltip rewritten with position:fixed + getBoundingClientRect-driven coordinates clamped to viewport bounds (no more off-screen clipping near right-edge chips); pointer triangle dropped (no longer accurate after clamp shifts); left + right columns each collapse to a 28px strip with an inner-edge toggle button, smooth 0.2s width transition
- [#41] Drawer-style hide + SignalsPanel density — replaced the 28px-strip collapse with full drawer behavior (width 0, content unmounts) so columns vanish entirely; reopen via persistent NEWS / COPILOT chips in PriceBar with on/off contrast (filled bg + bright fg when visible, transparent + muted when hidden); SignalsPanel padding 6/16→12/20, row gap 6→14, chip label-to-value gap 1→5, switching to wider min-width per chip — no more crammed feel
- [#42] Mock data fallbacks — /api/news + /api/analyze short-circuit to realistic mock data when API keys are placeholder/missing or the upstream errors; news mock = 8 articles spanning all impact + sentiment combos; analyze mock derives bias/levels/confluence from the request snapshot so the Copilot card always reads fully populated
- [#43] French localization — visible UI labels translated via two perl multi-line passes (JSX text content + JSX attribute literals) plus targeted edits for catalyst/button strings; preserves trader vocabulary in English (LONG/SHORT/FLAT, BULLISH/BEARISH, ticker symbols, indicator abbreviations); page title "NUGX — Terminal XAU/USD"
- [#44] Journal feature deletion — removed components/JournalPanel.tsx + lib/journal.ts + lib/hooks/useJournal.ts + JOURNAL chip in PriceBar + J/ESC keyboard handler in page.tsx + journal entry in shortcut hints
- [#45] Responsive layout + auto-Copilot + white CTA — useBreakpoint hook (mobile <768 / tablet 768-1023 / desktop ≥1024); page flips to vertical stack on mobile (drawers always-on, chart fixed 320px, both sides full-width); tablet shrinks side widths to 240/260; SignalsPanel + BottomBar wrap their chips so they reflow on narrow viewports; PriceBar toggle chips hidden on mobile; AnalysisPanel auto-triggers analysis once on first price tick so the Copilot card pre-populates without a click; primary CTA "LANCER L'ANALYSE" button gets white background + black text + 600 weight to read as the dashboard's main action
- [#46] SignalsPanel single-row — collapsed two stacked rows into one continuous horizontal line with inline chips (label + value side-by-side); section pills [MACRO] / [TECHNIQUE] stand out with dark-bg + bright-fg + 0.16em letter-spacing; vertical dividers between sections; STATUS marker pinned right via marginLeft:auto absorbing any leftover horizontal space (no more dead area)
- [#47] Copilot tooltips + French finish + data-section markers — every AnalysisPanel label (COPILOTE header, market-condition badge, recommendation, BIAIS, CONFIANCE, ENTRÉE/STOP/OBJECTIF, R/R, DURÉE, INVALIDATION, CONFLUENCE, 8-signal grid, entry-type badge, NOW/RISK/TRIGGER/EXIT, footer timestamps) now wrapped in a Tooltip with a French explanation; SIGNAL_LABELS + LAST/TA labels translated; market-condition + entry-type badges show French copy (TENDANCE / RANGE / BREAKOUT / ENTRÉE IDÉALE / etc); semantic data-section attributes added on every block for self-documenting markup in DevTools
- [#48] Mobile/iPad responsive rework — SignalsPanel switched from flex-wrap to ALWAYS horizontal scroll (nowrap + overflowX:auto + WebkitOverflowScrolling:touch + thin scrollbar) so chips never wrap and a touch trader gets native horizontal swipe; page.tsx introduces an `isStacked = bp !== 'desktop'` flag covering BOTH mobile and tablet — children of the middle row use CSS `order` to flip into the touch-trader hierarchy: chart (1) → Copilot (2) → News+Calendar (3); per-breakpoint chart heights (mobile 280px, tablet 420px, desktop flex:1); shortcut hint strip + drawer toggle chips hidden on stacked layouts; top-level page divs all carry data-section markers (page-root, topbar-wrapper, signals-strip, middle-row, left-drawer, chart, right-drawer, shortcut-hints, bottombar-wrapper); PriceBar prop renamed isMobile → isStacked for the consistent vocabulary
- [#49] lightweight-charts installed — npm install lightweight-charts (v5.2.0) added to dependencies; no source files touched, no config changed; tsc --noEmit clean
- [#50] GoldChart built — Lightweight Charts with real OHLCV candles, EMA20/50/200 lines, AI level drawing, TradingView live ticker below, 1min refresh. lib/types.ts gains ChartCandle / ChartLinePoint / ChartSeries / TechnicalsResponse / ChartLevels. /api/technicals reshaped to { indicators, chart: { candles, ema20, ema50, ema200 } } — server-side EMA computed from same closes array as indicators, candles de-duped on time + sorted. useTechnicals exposes chartCandles + ema20/50/200Series alongside indicators. AnalysisPanel accepts onLevelsUpdate prop, parses first numeric out of entry/stop/target/resistance/support strings, mixes in technicals.swingHigh/swingLow. page.tsx lifts ChartLevels state with useCallback setter, passes it down to GoldChart. components/TradingViewChart.tsx (filename preserved to keep imports stable) renamed to GoldChart internally — top 70% Lightweight Charts canvas (dynamic import inside useEffect for SSR safety, ResizeObserver for fluid resize, candlestick + volume overlay + 3 EMA lines, AI level lines via createPriceLine with dashed entry/stop/target + dotted res/sup + muted dotted swingH/L), bottom 30% TradingView iframe at 5min interval with toolbars hidden + LIVE label overlay; thin legend strip above chart with EMA swatches + ENTRY/STOP/TARGET swatches when levels exist + UPDATING marker on first load. useTechnicals polling stays at 60s (already correct from prior step). tsc --noEmit clean; dev server boots, /api/technicals returns 200 with 479 candles + aligned EMA series.
- [SPRINT-1] New types added — timeframes, patterns, analysis history, session briefing, invalidation alerts, confidence calibration. lib/types.ts gains: Timeframe + ChartSeriesPoint + TimeframeCandles; PatternName + PatternDirection + PatternSignificance + DetectedPattern; TradeOutcome + AnalysisHistoryRecord + PersonalPatterns; SessionBriefingContent + SessionBriefing; AlertSeverity + InvalidationAlert; ConfidenceCalibration. TechnicalsResponse gains optional tf15m / tf1h / tf4h / patterns fields (optional during the types-only landing so existing /api/technicals route still type-checks; SPRINT-2 populates them). No other files touched. tsc --noEmit clean.
- [SPRINT-2] Multi-timeframe fetch — 15M / 1H / 4H candles via Promise.all, pattern detection across all timeframes, cached 60s. /api/technicals/route.ts rewritten — three Yahoo fetches in parallel (15M=15m/5d, 1H=1h/60d, 4H=1h/90d aggregated to 4-hour buckets server-side since Yahoo doesn't expose 4h interval), each in its own try/catch so a per-TF failure returns an empty TimeframeCandles bundle without taking down the whole route, `export const revalidate = 60` for server-side caching. New lib/patterns.ts implements all 12 patterns from the spec (BULLISH/BEARISH ENGULFING, HAMMER, SHOOTING_STAR, INSIDE_BAR, DOJI, BULLISH/BEARISH MARUBOZU, HIGHER_HIGH_HIGHER_LOW, LOWER_HIGH_LOWER_LOW, DOUBLE_TOP_FORMING, DOUBLE_BOTTOM_FORMING) plus dedupePatterns that collapses same-name detections across TFs to the highest TF (4H>1H>15M) and notes confirmation on the others. buildTimeframe helper computes per-TF EMA20/50 series + scalar reads (EMA20, EMA50, RSI14, MACD histogram + cross, trend, rsiZone). 1H bundle still drives the canonical TechnicalIndicators snapshot for SignalsPanel + AnalysisPanel + the legacy chart payload, so existing consumers work unchanged. useTechnicals hook gains tf15m / tf1h / tf4h / patterns fields. Verified: dev server returns 200 in ~350ms with 401 / 970 / 391 candles per TF and 2 patterns detected (INSIDE_BAR 4H + BULLISH_ENGULFING 1H), tsc --noEmit clean.
- [SPRINT-9] Auto session briefing — at London open the copilot writes a 5-section briefing (overnight, key levels, calendar risk, session bias, watch for) the trader reads in 30 seconds. New lib/briefing.ts: STORAGE_KEY 'goldDashboard_briefings', MAX_BRIEFINGS 30, gen window 06–09 UTC, getTodaysBriefing/saveBriefing/shouldGenerateBriefing/getBriefingHistory; saveBriefing replaces same-date entries (manual + auto can both fire). New app/api/briefing/route.ts: POST handler with Marcus Reid system prompt, JSON-only output, REQUIRED_FIELDS validator; mock briefing derives bias/confidence from snapshot when ANTHROPIC_API_KEY missing/placeholder or upstream fails (same posture as /api/analyze). New lib/hooks/useBriefing: self-contained — fetches /api/price + /api/signals + /api/technicals + /api/calendar + /api/news in parallel inside trigger() so the hook works regardless of where it's called from; on mount loads today's briefing if any, otherwise (when shouldGenerateBriefing is true) waits 5s for route caches to warm + auto-fires; 60s interval re-checks and fires across the 07:00 UTC boundary; triggeringRef guards against double-fire. New components/BriefingModal.tsx: 480px modal, click-outside closes, header with LONDON SESSION BRIEFING + date + bias badge, isGenerating shows pulse "GENERATING BRIEFING..." copy, otherwise renders 5 stacked sections (OVERNIGHT/KEY LEVELS/CALENDAR auto-amber when high-impact keywords match/BIAS bright #e5e5e5 11px weight 500/WATCH FOR green #0a1a0a bg + #4ade80 text); footer with "Generated at" timestamp + CLOSE button. components/PriceBar.tsx gains optional onBriefingClick + hasBriefing props; renders BRIEFING chip between COPILOTE button and LIVE indicator with green palette + ● dot when today's briefing exists, muted otherwise. app/page.tsx wires useBriefing, isBriefingOpen state, auto-opens when briefing.generatedAt changes (skipped if document.activeElement is INPUT/TEXTAREA so a typing trader isn't interrupted), ESC closes both journal + briefing, BriefingModal renders at bottom of main. tsc --noEmit clean.
- [SPRINT-8] Invalidation alerts — price-cross detection, banner stack, dedupe + auto-expiry. New lib/alerts.ts: STORAGE_KEY 'goldDashboard_alerts', MAX_ALERTS 50, ALERT_EXPIRY_MS 4h; createAlert/getAlerts/dismissAlert/dismissAll/getActiveAlerts (filters dismissed + expired). New lib/hooks/useAlerts({lastAnalysis, currentPrice}): WARNING_BAND_PCT 0.5%; alertFiredRef Set keyed by `${generatedAt}-warning|critical` for in-memory dedupe; localStorage re-seeds the ref on mount so alerts already fired in a previous session don't re-fire on first tick; new generatedAt detected via lastAnalysisIdRef → wipe Set + dismissAllInStorage so a fresh thesis fires fresh alerts; price-cross logic: LONG → currentPrice ≤ inv = CRITICAL, SHORT → ≥ inv = CRITICAL; warning fires when distance% ≤ 0.5 and not yet crossed; refresh on 10s interval to pick up cross-tab dismiss state. New components/AlertBanner.tsx: position:fixed at top:48px (below PriceBar), zIndex 100, CRITICAL palette #2a0000/red border/⚠ THESIS INVALIDATED label, WARNING palette #1a1200/amber border/⚠ APPROACHING INVALIDATION; banner row shows label + message + price-at-trigger + time-since + ✕ dismiss; >2 active alerts collapses overflow to "+N MORE" + DISMISS ALL button; per-severity heights exported (CRITICAL_HEIGHT 40, WARNING_HEIGHT 36, MORE_ROW_HEIGHT 28). app/globals.css gains slideDown keyframe + .alert-banner class. AnalysisPanel gains optional onAnalysisComplete prop (called once per unique generatedAt alongside saveAnalysis). app/page.tsx lifts lastAnalysisResult state via the new callback, calls useAlerts, computes alertStackHeight from inline alerts (capped at 2) + overflow, renders a fixed-height spacer div that reserves the layout space the fixed banner occupies (height collapses to 0 + transition for graceful dismiss). tsc --noEmit clean.
- [SPRINT-7] Personal patterns fed into Claude prompt — the AI now sees the trader's history and adjusts. lib/types.ts AnalysisRequest gains personalPatterns (hasData, totalOutcomes, overallAccuracy, bestSession, bestConfluenceThreshold, currentSessionAccuracy, currentConfluenceAccuracy, insight). AnalysisPanel: new buildPersonalPatterns helper wraps the assembly in try/catch (any malformed history collapses to hasData=false), pulls patternsData from useHistory, sessionStats from bySession[currentSession], confluenceStats from byConfluenceScore[lastConfluenceScore] (data?.confluenceScore from the prior run as a "typical setup" hint, undefined on first run → null accuracy). hasData = totalWithOutcome >= 5. /api/analyze system prompt gains PERSONAL PERFORMANCE CONTEXT block — calibration rules (currentSessionAccuracy <45% → cite in rationale + "reduce position size", currentConfluenceAccuracy ≥65% → mention in entryTiming, bestSession matches → acknowledge if HIGH confidence, score ≥ bestConfluenceThreshold → note historically profitable, hasData=false → ignore). User message gains buildPersonalHistorySection — emits header always, branches on hasData; "no data" / "X%" / "not yet determined" formatting prevents misleading Claude with 0%; uses "Recent confluence-bucket accuracy" instead of interpolating a confluence score the message-build doesn't have. tsc --noEmit clean.
- [SPRINT-6] JournalPanel rebuilt — JOURNAL + MEMORY tabs, recreated lib/journal.ts + useJournal hook (deleted in [#44]). lib/journal.ts: STORAGE_KEY 'goldDashboard_journal' (matches the spec from .claude/context.md), MAX_ENTRIES 50, addEntry/closeEntry/deleteEntry with crypto.randomUUID, calculatePnL = (exit - entry) * directionMul * 100oz lot per the spec, formatPnL = "+$X" / "-$X". useJournal hook returns entries (sorted newest first) + add/close/delete + refresh. New components/JournalPanel.tsx — fixed-position overlay, 380px right-side panel, click-outside to close, header with TRADE JOURNAL label + close ✕, tab switcher JOURNAL/MEMORY (active=bottom border #e5e5e5, inactive=#444444), JOURNAL tab has NewEntryForm (LONG/SHORT toggle with green/red palette, ENTRY/STOP/TARGET grid, NOTES textarea, "LOG TRADE +" green button) + scrollable EntryCard list (LONG/SHORT chip + session, 3-col price grid, P&L row when closed colored by sign, EntryCloseForm per-card with own state when open, italic notes, formatDateTime + ✕ delete with hover red), MEMORY tab pulls patterns from useHistory and renders onboarding (X/5 outcomes + helper copy) when totalWithOutcome<5, otherwise shows ACCURACY (overall %, color tier ≥65 green / ≥50 amber / red) + INSIGHT card (#161616 bg) + BY SESSION / BY CONFLUENCE SCORE (5..8, with bestConfluenceThreshold row highlighted via 2px green left border) / BY ENTRY TYPE (IDEAL/AGGRESSIVE/WAIT) AccuracyRow grid bars. Footer shows trade count + 'localStorage' marker. app/page.tsx: imports JournalPanel, adds isJournalOpen useState, renders <JournalPanel> at bottom of main, J key toggles + ESC closes (existing keydown handler extended), shortcut hints strip gains [J, journal] entry alongside [R, analyser]. tsc --noEmit clean.
- [SPRINT-5] Analysis history + outcome tracker — every successful analysis persists to localStorage; a +2H/+4H follow-up checker classifies HIT_TARGET/HIT_STOP/OPEN/INCONCLUSIVE against live price. New lib/history.ts: STORAGE_KEY 'goldDashboard_analysisHistory', MAX_RECORDS 200 (oldest trimmed). saveAnalysis(result, price, session) creates an AnalysisHistoryRecord (uuid via crypto.randomUUID with fallback) snapshotting bias/confidence/recommendation/confluence/session/entry/stop/target/invalidation/RR; getHistory returns sorted-newest-first; updateOutcome(id, '2H'|'4H', currentPrice) parses entry/stop/target via parseFirstNumber regex, classifies per spec (LONG: ≥target=HIT_TARGET, ≤stop=HIT_STOP, between=OPEN, unparseable=INCONCLUSIVE; SHORT mirrors; FLAT always INCONCLUSIVE), writes priceAt2H/checkedAt2H/outcome2H or 4H counterparts; getPersonalPatterns aggregates by session/confluenceScore/entryType, prefers outcome4H over outcome2H, computes overallAccuracy, bestSession (≥3 outcomes), bestConfluenceThreshold (lowest score with ≥5 outcomes and ≥65% accuracy), human-readable insight string per spec branching (≤5 outcomes onboarding line, else lead with bestSession or threshold or overall). New lib/hooks/useHistory.ts: loads on mount, exposes saveAnalysis/refresh/history/patterns; outcome checker every 5min — pulls /api/price, walks records, writes 2H outcomes for >=2H records and 4H for >=4H, all idempotent via checkedAtNH presence; bails early when no record is due to skip the price round-trip; dispatches 'historyUpdated' CustomEvent for cross-component refresh + listens for the same event so a save from another component refreshes here. AnalysisPanel imports useHistory and saves on each new data.generatedAt (lastSavedAt ref dedupes). tsc --noEmit clean.
- [SPRINT-4] Multi-timeframe prompt enrichment — Claude now sees 4H/15M context + pattern data on every analyze request. lib/types.ts AnalysisRequest gains tf15m/tf4h (compact scalar reads: trend, rsi, rsiZone, macdHistogram, macdCross, ema20, ema50, priceVsEma20) + detectedPatterns array (pattern/timeframe/direction/significance/description). AnalysisPanel.buildRequest pipes these in from useTechnicals (tf15m + tf4h pulled directly off the per-TF bundles, priceVsEma20 derived from live spot vs the per-TF EMA20 since the bundle doesn't carry it natively, detectedPatterns = technicals.patterns). /api/analyze/route.ts system prompt gains MULTI-TIMEFRAME ANALYSIS RULES (4H = trend filter, never trade against; 1H = setup; 15M = entry timing — ideal entry = MACD cross on pullback in trend direction), CONFLUENCE BONUS RULE (all 3 TFs aligned = +1 point, can exceed 8/8, note as TIMEFRAME ALIGNMENT in catalyst), PATTERN RULES (HIGH on 4H = full confluence point, HIGH on 1H/15M = entry timing color, bearish-against-bias pattern → cite in RISK). User message gains buildMultiTimeframeSection + buildPatternsSection helpers — 4H/15M sections gracefully skip when ema20 === 0 (per-TF fetch failed), patterns section emits "No significant patterns detected" header when array empty. AnalysisResult JSON shape unchanged. tsc --noEmit clean.
- [SPRINT-3] Multi-timeframe chart — 15M/1H/4H switcher, pattern markers on candles, trend alignment strip. components/TradingViewChart.tsx (file kept as-is for import stability) gains: useState<Timeframe> activeTimeframe defaulting '1H'; TfButton sub-component renders 15M|1H|4H with active=bottom border + bright fg, inactive=#444444; activeData useMemo picks the right candle/EMA bundle from useTechnicals based on activeTimeframe (1H keeps the canonical chart payload incl. EMA200, 15M/4H pull from per-TF bundles with EMA200 cleared since per-TF bundles don't carry it); per-data setData effects rekey on activeData so a TF switch swaps candles + EMAs and chart.timeScale().fitContent() re-frames. Pattern markers via createSeriesMarkers plugin (v5 moved markers out of the series API): markersRef holds the plugin instance, refreshed when activePatterns or activeTimeframe change — bullish patterns = green arrowUp belowBar, bearish = red arrowDown aboveBar, neutral = amber circle belowBar; pattern names abbreviated per spec (ENG↑/ENG↓/HAM/SS/IB/DOJI/MRZ↑/MRZ↓/HH-HL/LH-LL/DBL↑/DBL↓). Trend alignment strip below the legend bar (16px) shows 4H/1H/15M trends with color = trendColor(t) + an "● ALIGNED" badge in green/red when all three agree. AI level lines redraw on TF switch so they stay in sync with the active chart. EMA200 swatch fades to #222222 on 15M/4H so the trader sees at a glance the line isn't drawn there. tsc --noEmit clean.
