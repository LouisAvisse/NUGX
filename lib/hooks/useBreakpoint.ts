// useBreakpoint — tiny client-side hook that watches the
// viewport width and returns the active layout breakpoint.
//
// Three breakpoints, matching the dashboard's responsive design:
//   mobile   <  768px   stack vertically, scroll the page
//   tablet   ≥  768px and < 1024px   tighter side columns
//   desktop  ≥ 1024px   the full 3-column layout
//
// SSR returns 'desktop' on the first render (window doesn't
// exist server-side). The first useEffect tick on mount
// re-evaluates against window.innerWidth and a resize listener
// keeps the value live for the rest of the session.

'use client'

import { useEffect, useState } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>('desktop')

  useEffect(() => {
    function check() {
      const w = window.innerWidth
      if (w < 768) setBp('mobile')
      else if (w < 1024) setBp('tablet')
      else setBp('desktop')
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return bp
}
