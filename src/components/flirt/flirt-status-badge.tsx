"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FLIRT_STATUS_LABELS,
  FLIRT_STATUSES,
  type FlirtStatus,
} from "@/lib/types";

const STATUS_CLASS: Record<FlirtStatus, string> = {
  looked: "border-gold/30 text-gold/80",
  chatting: "border-sky-400/40 text-sky-300",
  fucked: "border-rose-400/50 text-rose-300",
};

export function FlirtStatusBadge({
  status,
  className,
}: {
  status: FlirtStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] sm:text-xs", STATUS_CLASS[status], className)}
    >
      {FLIRT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function FlirtStatusSelector({
  value,
  onChange,
  disabled,
}: {
  value: FlirtStatus;
  onChange: (status: FlirtStatus) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FLIRT_STATUSES.map((status) => {
        const active = value === status;
        return (
          <button
            key={status}
            type="button"
            disabled={disabled}
            onClick={() => onChange(status)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              active
                ? "border-gold bg-gold/15 text-gold"
                : "border-gold/20 text-muted-foreground hover:border-gold/40 hover:text-ivory",
              disabled && "opacity-50"
            )}
          >
            {FLIRT_STATUS_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}
