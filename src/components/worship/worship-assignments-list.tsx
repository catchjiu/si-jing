"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, ExternalLink } from "lucide-react";
import type { WorshipAssignment } from "@/lib/types";
import { formatDeadline, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Props = {
  assignments: WorshipAssignment[];
  entryCounts?: Record<string, number>;
  className?: string;
};

export function WorshipAssignmentsList({
  assignments,
  entryCounts = {},
  className,
}: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (assignments.length === 0) return null;

  return (
    <ul className={cn("space-y-2", className)}>
      {assignments.map((a) => {
        const count = a.gallery_id ? entryCounts[a.gallery_id] ?? 0 : 0;
        const overdue =
          a.status === "open" && new Date(a.due_at).getTime() < Date.now();
        return (
          <li
            key={a.id}
            className={cn(
              "rounded-lg border px-4 py-3",
              a.status === "completed"
                ? "border-emerald-500/25 bg-emerald-950/20"
                : overdue
                  ? "border-red-500/30 bg-red-950/20"
                  : "border-gold/15 bg-charcoal/60"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-heading text-lg text-ivory">{a.topic}</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] uppercase",
                      a.status === "completed"
                        ? "border-emerald-500/40 text-emerald-300"
                        : overdue
                          ? "border-red-500/40 text-red-300"
                          : "border-gold/30 text-gold"
                    )}
                  >
                    {a.status === "completed"
                      ? "Done"
                      : overdue
                        ? "Overdue"
                        : a.status}
                  </Badge>
                </div>
                {a.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.description}
                  </p>
                )}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {a.status === "completed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    Due {formatDeadline(a.due_at)}
                  </span>
                  <span>
                    Photos {count}/{a.min_entries}
                  </span>
                  {a.completed_at && (
                    <span>Finished {formatRelative(a.completed_at)}</span>
                  )}
                </p>
              </div>
              {a.gallery_id && (
                <Link
                  href={`/dashboard/worship/${a.gallery_id}`}
                  className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
                >
                  Open gallery
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
