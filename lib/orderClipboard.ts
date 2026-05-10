// lib/orderClipboard.ts — [PHASE-12.4] order-template formatter.
//
// Generates a one-line order ticket string in the format the
// trader's execution platform expects, ready to be copied to the
// clipboard and pasted into MT5/cTrader/TradingView's order entry
// or sent to a broker on Telegram/Discord.
//
// Three flavors:
//
//   MT5         — "BUY XAUUSD 0.10 @ 2441.00 SL 2420.00 TP 2480.00"
//   CTRADER     — same shape with cTrader's wording
//   TRADINGVIEW — "long XAUUSD entry=2441.0 stop=2420.0 target=2480.0"
//   PLAIN       — fallback / human-readable format used when copying
//                 to a chat channel.
//
// Pure formatter, no I/O. The caller (AnalysisPanel "COPY ORDER"
// button) wraps this in navigator.clipboard.writeText().

import type { TradeDirection } from '@/lib/types'

// Supported execution-platform formats. Add new entries here +
// extend formatOrder() below; consumers select via a small chip.
export type OrderFormat = 'MT5' | 'CTRADER' | 'TRADINGVIEW' | 'PLAIN'

export interface OrderTicket {
  symbol: string                    // e.g. "XAUUSD"
  direction: TradeDirection         // 'LONG' | 'SHORT'
  lotSize: number                   // size in MT5 lot units (1.0 = 100 oz)
  entry: number                     // USD per oz
  stop: number
  target: number
}

// Format a number with a fixed precision. XAU/USD prices typically
// quote to two decimals on MT5, but some brokers price to three —
// we ship two by default and consumers can post-process if needed.
function fmtPrice(n: number): string {
  return n.toFixed(2)
}

// Format the lot size — MT5 expects lots like 0.01, 0.10, 1.00.
function fmtLot(n: number): string {
  return n.toFixed(2)
}

export function formatOrder(ticket: OrderTicket, format: OrderFormat): string {
  const { symbol, direction, lotSize, entry, stop, target } = ticket
  const verbBuy = direction === 'LONG' ? 'BUY' : 'SELL'

  switch (format) {
    case 'MT5':
      return `${verbBuy} ${symbol} ${fmtLot(lotSize)} @ ${fmtPrice(entry)} SL ${fmtPrice(stop)} TP ${fmtPrice(target)}`
    case 'CTRADER':
      return `${verbBuy} ${symbol} Volume=${fmtLot(lotSize)} Limit=${fmtPrice(entry)} SL=${fmtPrice(stop)} TP=${fmtPrice(target)}`
    case 'TRADINGVIEW':
      return `${direction === 'LONG' ? 'long' : 'short'} ${symbol} entry=${fmtPrice(entry)} stop=${fmtPrice(stop)} target=${fmtPrice(target)} size=${fmtLot(lotSize)}`
    case 'PLAIN':
      return `${direction} ${symbol} | size ${fmtLot(lotSize)} | entry ${fmtPrice(entry)} | stop ${fmtPrice(stop)} | target ${fmtPrice(target)}`
  }
}

// Convenience wrapper: copy the formatted string to the clipboard.
// Returns true on success, false if the navigator API is missing
// or the write fails. Caller surfaces a transient toast on either.
export async function copyOrderToClipboard(
  ticket: OrderTicket,
  format: OrderFormat
): Promise<boolean> {
  const text = formatOrder(ticket, format)
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
