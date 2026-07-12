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
      className={cn("flex flex-wrap gap-2 sm:gap-3", className)}
      role="timer"
      aria-live="polite"
      aria-label={`${parts.days} days ${parts.hours} hours remaining`}
    >
      {segments.map(({ value, label }) => (
        <div
          key={label}
          className={cn(
            "flex flex-col items-center rounded-lg border border-red-500/30 bg-void/60",
            size === "lg" ? "min-w-[4.5rem] px-3 py-2" : "min-w-[3.25rem] px-2 py-1.5"
          )}
        >
          <span
            className={cn(
              "font-heading tabular-nums text-red-300",
              size === "lg" ? "text-3xl" : "text-xl"
            )}
          >
            {String(value).padStart(2, "0")}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
        "relative overflow-hidden rounded-xl border border-red-500/40 bg-gradient-to-br from-red-950/80 via-charcoal to-void p-6 md:p-8",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(185,28,28,0.25),transparent_50%)]" />
      <div className="relative space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-red-950/50">
            <Ban className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-red-400/80">
              Active punishment
            </p>
            <h2 className="font-heading mt-1 text-2xl text-ivory md:text-3xl">
              {punishment.title || "Contact Restricted"}
            </h2>
            <p className="mt-2 text-sm text-ivory/70">
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
