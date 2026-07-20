"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

function getScrollProgress(): number {
  const max =
    document.documentElement.scrollHeight - window.innerHeight
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, window.scrollY / max))
}

export function ScrollProgressBar() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const update = () => setProgress(getScrollProgress())
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update, { passive: true })
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [pathname])

  if (progress <= 0) return null

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-14 z-[45] h-[3px] lg:top-0 lg:left-64"
      aria-hidden
    >
      <div
        className="h-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.45)]"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  )
}
