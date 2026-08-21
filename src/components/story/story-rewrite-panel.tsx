"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Tags } from "lucide-react";
import {
  STORY_REWRITE_PROMPTS,
  type StoryRewritePromptId,
} from "@/lib/story-prompts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type StoryRewritePanelProps = {
  html: string;
  onApply: (html: string) => void;
  disabled?: boolean;
  className?: string;
};

export function StoryRewritePanel({
  html,
  onApply,
  disabled,
  className,
}: StoryRewritePanelProps) {
  const [selected, setSelected] = useState<StoryRewritePromptId[]>([]);
  const [rewriting, setRewriting] = useState(false);

  const toggle = (id: StoryRewritePromptId) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const rewrite = async () => {
    if (selected.length === 0) {
      toast.error("Tag at least one writing prompt");
      return;
    }
    setRewriting(true);
    try {
      const res = await fetch("/api/story/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, promptIds: selected }),
      });
      const data = (await res.json()) as { html?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Rewrite failed");
      }
      if (!data.html) {
        throw new Error("No rewritten story returned");
      }
      onApply(data.html);
      toast.success("Claude rewrote the draft — review before saving");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rewrite failed");
    } finally {
      setRewriting(false);
    }
  };

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-gold/20 bg-charcoal/50 p-4",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <div>
          <p className="text-sm font-medium text-ivory">Claude rewrite</p>
          <p className="text-xs text-muted-foreground">
            Tag prompts, then ask Claude to improve this draft. Only you (slave)
            can use this — Queen still sees the saved story.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STORY_REWRITE_PROMPTS.map((prompt) => {
          const active = selected.includes(prompt.id);
          return (
            <button
              key={prompt.id}
              type="button"
              title={prompt.description}
              disabled={disabled || rewriting}
              onClick={() => toggle(prompt.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors",
                active
                  ? "border-gold/50 bg-gold/15 text-gold"
                  : "border-gold/15 bg-void/40 text-ivory/70 hover:border-gold/30 hover:text-ivory"
              )}
            >
              <Tags className="h-3 w-3 opacity-70" />
              {prompt.label}
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        size="sm"
        disabled={disabled || rewriting || selected.length === 0}
        onClick={() => void rewrite()}
        className="bg-gold text-void hover:bg-gold-muted"
      >
        {rewriting ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-3.5 w-3.5" />
        )}
        Rewrite with Claude
        {selected.length > 0 ? ` (${selected.length})` : ""}
      </Button>
    </div>
  );
}
