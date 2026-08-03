"use client";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function FlirtLevelMeter({
  label,
  value,
  className,
  compact,
  barClassName,
}: {
  label: string;
  value: number;
  className?: string;
  compact?: boolean;
  barClassName?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p
        className={cn(
          "text-muted-foreground",
          compact ? "text-[10px]" : "text-xs"
        )}
      >
        {label} {value}%
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-void/60">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            barClassName ?? "bg-gold/80"
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

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
    <FlirtLevelMeter
      label="Interest"
      value={value}
      className={className}
      compact={compact}
    />
  );
}

export function FlirtHotnessMeter({
  value,
  className,
  compact,
}: {
  value: number;
  className?: string;
  compact?: boolean;
}) {
  return (
    <FlirtLevelMeter
      label="Hotness"
      value={value}
      className={className}
      compact={compact}
      barClassName="bg-rose-400/80"
    />
  );
}

export function FlirtLevelSlider({
  label,
  value,
  onChange,
  disabled,
  id,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm text-ivory">
          {label}
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
    <FlirtLevelSlider
      id={id}
      label="Interest in escalating"
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

export function FlirtHotnessSlider({
  value,
  onChange,
  disabled,
  id = "flirt-hotness",
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <FlirtLevelSlider
      id={id}
      label="Hotness level"
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

export function FlirtJealousyMeter({
  value,
  className,
  compact,
}: {
  value: number;
  className?: string;
  compact?: boolean;
}) {
  return (
    <FlirtLevelMeter
      label="Jealousy"
      value={value}
      className={className}
      compact={compact}
      barClassName="bg-violet-400/80"
    />
  );
}

export function FlirtJealousySlider({
  value,
  onChange,
  disabled,
  id = "flirt-jealousy",
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <FlirtLevelSlider
      id={id}
      label="How jealous"
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
