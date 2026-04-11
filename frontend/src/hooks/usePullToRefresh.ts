import { useRef, useCallback, useEffect } from "react"

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void
  threshold?: number
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
}: UsePullToRefreshOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  /** `null` — жест не начат; иначе Y в px (в т.ч. 0 — валидная координата). */
  const startYRef = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const refreshingRef = useRef(false)
  const indicatorRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (refreshingRef.current) return
    const el = containerRef.current
    if (!el || el.scrollTop > 0) return
    startYRef.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (refreshingRef.current || startYRef.current === null) return
      const el = containerRef.current
      if (!el || el.scrollTop > 0) return

      const currentY = e.touches[0].clientY
      pullDistanceRef.current = Math.max(0, currentY - startYRef.current)

      if (pullDistanceRef.current > 0) {
        e.preventDefault()
        const progress = Math.min(pullDistanceRef.current / threshold, 1)
        if (indicatorRef.current) {
          indicatorRef.current.style.transform = `translateY(${Math.min(pullDistanceRef.current, threshold + 20)}px)`
          indicatorRef.current.style.opacity = String(progress)
        }
      }
    },
    [threshold],
  )

  const handleTouchEnd = useCallback(async () => {
    if (refreshingRef.current) return

    if (pullDistanceRef.current >= threshold) {
      refreshingRef.current = true
      if (indicatorRef.current) {
        indicatorRef.current.style.transform = `translateY(${threshold}px)`
        indicatorRef.current.classList.add("animate-spin")
      }
      try {
        await onRefresh()
      } finally {
        refreshingRef.current = false
        if (indicatorRef.current) {
          indicatorRef.current.style.transform = "translateY(0)"
          indicatorRef.current.style.opacity = "0"
          indicatorRef.current.classList.remove("animate-spin")
        }
      }
    } else {
      if (indicatorRef.current) {
        indicatorRef.current.style.transform = "translateY(0)"
        indicatorRef.current.style.opacity = "0"
      }
    }

    startYRef.current = null
    pullDistanceRef.current = 0
  }, [onRefresh, threshold])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener("touchstart", handleTouchStart, { passive: true })
    el.addEventListener("touchmove", handleTouchMove, { passive: false })
    el.addEventListener("touchend", handleTouchEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", handleTouchStart)
      el.removeEventListener("touchmove", handleTouchMove)
      el.removeEventListener("touchend", handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return { containerRef, indicatorRef }
}
