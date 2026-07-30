"use client";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function FlirtInterestMeter({
  value,
  className,
  compact,
}: {
  value: number;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p
        className={cn(
          "text-muted-foreground",
          compact ? "text-[10px]" : "text-xs"
        )}
      >
        Interest {value}%
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-void/60">
        <div
          className="h-full rounded-full bg-gold/80 transition-[width]"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export function FlirtInterestSlider({
  value,
  onChange,
  disabled,
  id = "flirt-interest",
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm text-ivory">
          Interest in escalating
        </Label>
        <span className="font-heading text-sm text-gold">{value}%</span>
      </div>
      <Slider
        id={id}
        min={0}
        max={100}
        step={1}
        value={[value]}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0] ?? 0)}
      />
    </div>
  );
}
