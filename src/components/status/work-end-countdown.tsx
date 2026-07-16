"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function remainingParts(targetMs: number, nowMs: number) {
  const diff = Math.max(0, targetMs - nowMs);
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds, done: diff <= 0 };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-[3rem] flex-col items-center rounded-lg border border-gold/20 bg-void/50 px-2 py-1.5 sm:min-w-[3.25rem]">
      <span className="font-heading text-lg tabular-nums text-gold sm:text-xl">
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wider opacity-70">
        {label}
      </span>
    </div>
  );
}

type WorkEndCountdownProps = {
  endAtMs: number;
  className?: string;
  /** Compact inline layout for narrow cards. */
  compact?: boolean;
};

/** Live countdown until the current work shift ends. */
export function WorkEndCountdown({
  endAtMs,
  className,
  compact = false,
}: WorkEndCountdownProps) {
  const [parts, setParts] = useState(() =>
    remainingParts(endAtMs, Date.now())
  );

  useEffect(() => {
    setParts(remainingParts(endAtMs, Date.now()));
    const id = window.setInterval(() => {
      setParts(remainingParts(endAtMs, Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, [endAtMs]);

  if (parts.done) return null;

  return (
    <div
      className={cn(
        compact
          ? "flex flex-wrap items-center gap-1.5"
          : "flex flex-wrap justify-center gap-1.5 sm:justify-start",
        className
      )}
      role="timer"
      aria-live="polite"
      aria-label={`${parts.hours} hours ${parts.minutes} minutes until work ends`}
    >
      {parts.days > 0 ? <Unit value={parts.days} label="Days" /> : null}
      <Unit value={parts.hours} label="Hours" />
      <Unit value={parts.minutes} label="Mins" />
      <Unit value={parts.seconds} label="Secs" />
    </div>
  );
}
