"use client"

import { useEffect, useState } from "react"
import { getCountdownParts } from "@/lib/format"
import { cn } from "@/lib/utils"

interface CountdownProps {
  deadline: string
  className?: string
  showLabels?: boolean
}

export function Countdown({
  deadline,
  className,
  showLabels = true,
}: CountdownProps) {
  const [parts, setParts] = useState(() => getCountdownParts(deadline))

  useEffect(() => {
    const tick = () => setParts(getCountdownParts(deadline))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [deadline])

  const segments = [
    { value: parts.days, label: "d" },
    { value: parts.hours, label: "h" },
    { value: parts.minutes, label: "m" },
    { value: parts.seconds, label: "s" },
  ]

  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      role="timer"
      aria-live="polite"
      aria-label={
        parts.isOverdue
          ? `Overdue by ${parts.days} days ${parts.hours} hours`
          : `${parts.days} days ${parts.hours} hours remaining`
      }
    >
      {parts.isOverdue && (
        <span className="mr-1 text-xs uppercase tracking-wider opacity-70">
          overdue
        </span>
      )}
      {segments.map(({ value, label }) => (
        <span key={label} className="tabular-nums">
          <span>{String(value).padStart(2, "0")}</span>
          {showLabels && (
            <span className="text-[0.65em] opacity-60">{label}</span>
          )}
        </span>
      ))}
    </div>
  )
}
