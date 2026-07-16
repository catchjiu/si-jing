"use client";

import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import { QUEEN_PLACE } from "@/lib/partner-locations";
import { zonedWallTimeToUtc } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/** Queen returns — start of day in Santa Cruz time. */
const RETURN_YMD = "2026-09-25";
const RETURN_HM = "00:00";

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
    <div className="flex min-w-[3.25rem] flex-col items-center rounded-lg border border-gold/20 bg-void/50 px-2 py-2 sm:min-w-[3.75rem]">
      <span className="font-heading text-xl tabular-nums text-gold sm:text-2xl">
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

type QueenReturnsCountdownProps = {
  className?: string;
};

export function QueenReturnsCountdown({
  className,
}: QueenReturnsCountdownProps) {
  const [targetMs] = useState(() =>
    zonedWallTimeToUtc(RETURN_YMD, RETURN_HM, QUEEN_PLACE.timeZone).getTime()
  );
  const [parts, setParts] = useState(() =>
    remainingParts(targetMs, Date.now())
  );

  useEffect(() => {
    setParts(remainingParts(targetMs, Date.now()));
    const id = window.setInterval(() => {
      setParts(remainingParts(targetMs, Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  return (
    <div
      className={cn(
        "rounded-xl border border-gold/25 bg-gradient-to-r from-royal/35 to-charcoal/80 px-4 py-4",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-void/40 text-gold">
          <Plane className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Queen returns
          </p>
          <p className="font-heading text-lg text-ivory sm:text-xl">
            {parts.done ? "She is back" : "Until September 25"}
          </p>
        </div>
        {!parts.done && (
          <div className="flex w-full flex-wrap justify-center gap-1.5 sm:ml-auto sm:w-auto sm:justify-end">
            <Unit value={parts.days} label="Days" />
            <Unit value={parts.hours} label="Hours" />
            <Unit value={parts.minutes} label="Mins" />
            <Unit value={parts.seconds} label="Secs" />
          </div>
        )}
      </div>
    </div>
  );
}
