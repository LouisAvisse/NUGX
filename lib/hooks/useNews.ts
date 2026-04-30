// useNews — polls /api/news every 15 minutes.
// Returns the article list plus loading/error/lastUpdated state.
// Used by NewsFeed (consumer added in a later commit). Slowest
// cadence of the four hooks because newsdata.io has a small free
// tier and headlines do not require sub-minute freshness.
//
// Note that this hook flattens the API response: the route returns
// `{ articles }`, but we expose `articles` directly on the return
// for convenience.

import { useState, useEffect } from 'react'
import type { NewsArticle } from '@/lib/types'

interface UseNewsReturn {
  articles: NewsArticle[]     // empty array until first response
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

export function useNews(): UseNewsReturn {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function fetch() {
    try {
      const res = await window.fetch('/api/news')
      if (!res.ok) throw new Error('Failed to fetch news')
      const json = await res.json()
      // The route returns NewsResponse `{ articles: NewsArticle[] }`;
      // we surface just the array so consumers don't have to unwrap.
      setArticles(json.articles)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError('News unavailable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Initial fetch then every 15 minutes (15 * 60 seconds).
    fetch()
    const interval = setInterval(fetch, 15 * 60_000)
    return () => clearInterval(interval)
  }, [])

  return { articles, loading, error, lastUpdated }
}
