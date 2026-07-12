"use client";

import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { getCountdownParts } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Punishment } from "@/lib/types";

interface PunishmentCountdownProps {
  endsAt: string;
  className?: string;
  size?: "sm" | "lg";
  onExpired?: () => void;
}

export function PunishmentCountdown({
  endsAt,
  className,
  size = "lg",
  onExpired,
}: PunishmentCountdownProps) {
  const [parts, setParts] = useState(() => getCountdownParts(endsAt));

  useEffect(() => {
    const tick = () => {
      const next = getCountdownParts(endsAt);
      setParts(next);
      if (next.isOverdue) onExpired?.();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endsAt, onExpired]);

  const segments = [
    { value: parts.days, label: "Days" },
    { value: parts.hours, label: "Hours" },
    { value: parts.minutes, label: "Mins" },
    { value: parts.seconds, label: "Secs" },
  ];

  if (parts.isOverdue) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Restriction ended
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-3",
        className
      )}
      role="timer"
      aria-live="polite"
      aria-label={`${parts.days} days ${parts.hours} hours remaining`}
    >
      {segments.map(({ value, label }) => (
        <div
          key={label}
          className={cn(
            "flex min-w-0 flex-col items-center rounded-lg border border-red-500/30 bg-void/60",
            size === "lg"
              ? "px-1.5 py-2 sm:min-w-[4.5rem] sm:px-3"
              : "px-1 py-1.5 sm:min-w-[3.25rem] sm:px-2"
          )}
        >
          <span
            className={cn(
              "font-heading tabular-nums text-red-300",
              size === "lg" ? "text-xl sm:text-3xl" : "text-lg sm:text-xl"
            )}
          >
            {String(value).padStart(2, "0")}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground sm:text-[10px]">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

interface ContactRestrictionBannerProps {
  punishment: Punishment;
  onExpired?: () => void;
  className?: string;
}

export function ContactRestrictionBanner({
  punishment,
  onExpired,
  className,
}: ContactRestrictionBannerProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-red-500/40 bg-gradient-to-br from-red-950/80 via-charcoal to-void p-4 sm:p-6 md:p-8",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(185,28,28,0.25),transparent_50%)]" />
      <div className="relative space-y-4 sm:space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-red-950/50 sm:h-11 sm:w-11">
            <Ban className="h-4 w-4 text-red-400 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-red-400/80 sm:text-xs">
              Active punishment
            </p>
            <h2 className="font-heading mt-1 text-xl text-ivory sm:text-2xl md:text-3xl">
              {punishment.title || "Contact Restricted"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ivory/70">
              You may not initiate contact with Queen Sisi until this timer ends.
            </p>
            {punishment.reason && (
              <p className="mt-3 border-l-2 border-red-500/40 pl-3 text-sm text-muted-foreground italic">
                {punishment.reason}
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
            Time remaining
          </p>
          <PunishmentCountdown
            endsAt={punishment.ends_at}
            onExpired={onExpired}
          />
        </div>
      </div>
    </div>
  );
}
