"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { StoryAiProvider } from "@/lib/story-ai";

export type { StoryAiProvider };

type StoryProviderPickerProps = {
  value: StoryAiProvider;
  onChange: (provider: StoryAiProvider) => void;
  disabled?: boolean;
  className?: string;
};

export function StoryProviderPicker({
  value,
  onChange,
  disabled,
  className,
}: StoryProviderPickerProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">Model</Label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("claude")}
          className={cn(
            "rounded-md border px-3 py-1.5 text-xs transition-colors",
            value === "claude"
              ? "border-gold/50 bg-gold/15 text-gold"
              : "border-gold/15 bg-void/40 text-ivory/70 hover:border-gold/30 hover:text-ivory"
          )}
        >
          Claude
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("grok")}
          className={cn(
            "rounded-md border px-3 py-1.5 text-xs transition-colors",
            value === "grok"
              ? "border-gold/50 bg-gold/15 text-gold"
              : "border-gold/15 bg-void/40 text-ivory/70 hover:border-gold/30 hover:text-ivory"
          )}
        >
          Grok 4.5
        </button>
      </div>
    </div>
  );
}

export function storyProviderLabel(provider: StoryAiProvider): string {
  return provider === "grok" ? "Grok 4.5" : "Claude";
}
