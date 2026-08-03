"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { User } from "lucide-react";
import { signObjectUrl } from "@/lib/storage/client";
import type { FlirtGuy, FlirtGuyWithSignedUrl, FlirtStatus } from "@/lib/types";
import { FLIRT_STATUS_LABELS, FLIRT_STATUSES } from "@/lib/types";
import { FlirtStatusBadge } from "@/components/flirt/flirt-status-badge";
import {
  FlirtHotnessMeter,
  FlirtInterestMeter,
  FlirtJealousyMeter,
} from "@/components/flirt/flirt-interest-slider";
import { cn } from "@/lib/utils";
import { FlirtCountBadge } from "@/components/flirt/flirt-count-badge";

async function withSignedUrls(
  guys: FlirtGuy[]
): Promise<FlirtGuyWithSignedUrl[]> {
  return Promise.all(
    guys.map(async (g) => {
      if (!g.photo_path) return g;
      const signedUrl =
        (await signObjectUrl({
          bucket: "flirt",
          path: g.photo_path,
        })) ?? undefined;
      return { ...g, signedUrl };
    })
  );
}

export function FlirtGuysGrid({
  guys,
  filter,
  onFilterChange,
  unreadByGuy = {},
}: {
  guys: FlirtGuy[];
  filter: FlirtStatus | "all";
  onFilterChange: (filter: FlirtStatus | "all") => void;
  unreadByGuy?: Record<string, number>;
}) {
  const [rows, setRows] = useState<FlirtGuyWithSignedUrl[]>([]);

  useEffect(() => {
    let cancelled = false;
    void withSignedUrls(guys).then((signed) => {
      if (!cancelled) setRows(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [guys]);

  const filtered =
    filter === "all" ? rows : rows.filter((g) => g.status === filter);

  const totalUnread = rows.reduce(
    (sum, guy) => sum + (unreadByGuy[guy.id] ?? 0),
    0
  );

  const unreadByStatus = FLIRT_STATUSES.reduce(
    (acc, status) => {
      acc[status] = rows
        .filter((g) => g.status === status)
        .reduce((sum, guy) => sum + (unreadByGuy[guy.id] ?? 0), 0);
      return acc;
    },
    {} as Record<FlirtStatus, number>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => onFilterChange("all")}
          label="All"
          count={totalUnread}
        />
        {FLIRT_STATUSES.map((status) => (
          <FilterChip
            key={status}
            active={filter === status}
            onClick={() => onFilterChange(status)}
            label={FLIRT_STATUS_LABELS[status]}
            count={unreadByStatus[status]}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
          No flirts yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((guy) => {
            const unread = unreadByGuy[guy.id] ?? 0;
            return (
            <li key={guy.id}>
              <Link
                href={`/dashboard/flirt/${guy.id}`}
                className="group flex flex-col items-center text-center outline-none"
              >
                <div
                  className={cn(
                    "relative h-24 w-24 overflow-hidden rounded-full border-2 bg-void/50 transition group-hover:border-gold/60 group-focus-visible:border-gold sm:h-28 sm:w-28",
                    unread > 0 ? "border-gold/50" : "border-gold/25"
                  )}
                >
                  {unread > 0 && (
                    <FlirtCountBadge
                      count={unread}
                      size="sm"
                      className="absolute -right-0.5 -top-0.5 z-10 ring-2 ring-void"
                    />
                  )}
                  {guy.signedUrl ? (
                    <Image
                      src={guy.signedUrl}
                      alt={guy.name}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-charcoal text-muted-foreground">
                      <span className="font-heading text-2xl text-gold/70">
                        {guy.name.trim().charAt(0).toUpperCase() || (
                          <User className="h-8 w-8" />
                        )}
                      </span>
                    </div>
                  )}
                </div>
                <p className="mt-2 max-w-full truncate font-heading text-sm text-ivory group-hover:text-gold sm:text-base">
                  {guy.name}
                </p>
                <div className="mt-1">
                  <FlirtStatusBadge status={guy.status} />
                </div>
                <div className="mt-2 w-full max-w-[7.5rem] space-y-1.5">
                  <FlirtInterestMeter value={guy.interest_level} compact />
                  <FlirtHotnessMeter value={guy.hotness_level} compact />
                  <FlirtJealousyMeter value={guy.jealousy_level} compact />
                </div>
              </Link>
            </li>
          );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count = 0,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-gold bg-gold/15 text-gold"
          : "border-gold/20 text-muted-foreground hover:border-gold/40 hover:text-ivory"
      )}
    >
      {label}
      <FlirtCountBadge count={count} size="sm" />
    </button>
  );
}
