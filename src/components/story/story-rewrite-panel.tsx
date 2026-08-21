"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  RotateCcw,
  Sparkles,
  Tags,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import {
  STORY_REWRITE_PROMPTS,
  type StoryRewritePromptId,
} from "@/lib/story-prompts";
import { formatRoleSpeechHtml } from "@/lib/role-speech";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StoryHtmlView } from "@/components/story/story-rich-text-editor";
import { sanitizeStoryHtml } from "@/lib/sanitize-html";

export type StoryRewriteProvider = "claude" | "grok";

type StoryRewritePanelProps = {
  /** Current draft in the editor — only replaced when slave accepts a preview. */
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
  const { profile } = useAuth();
  const [provider, setProvider] = useState<StoryRewriteProvider>("claude");
  const [selected, setSelected] = useState<StoryRewritePromptId[]>([]);
  const [extraNote, setExtraNote] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const providerLabel = provider === "grok" ? "Grok 4.5" : "Claude";
  const authorRole = profile?.role;

  const toggle = (id: StoryRewritePromptId) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const sourceHtml = previewHtml ?? html;

  const rewrite = async () => {
    if (selected.length === 0 && !extraNote.trim()) {
      toast.error("Tag a prompt or write a fix note");
      return;
    }
    setRewriting(true);
    try {
      const res = await fetch("/api/story/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: sourceHtml,
          promptIds: selected,
          extraInstruction: extraNote.trim() || undefined,
          provider,
        }),
      });
      const data = (await res.json()) as { html?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Rewrite failed");
      }
      if (!data.html) {
        throw new Error("No rewritten story returned");
      }
      setPreviewHtml(
        formatRoleSpeechHtml(sanitizeStoryHtml(data.html), authorRole)
      );
      toast.success(
        `${providerLabel} preview ready — accept it, or refine with more prompts`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rewrite failed");
    } finally {
      setRewriting(false);
    }
  };

  const acceptPreview = () => {
    if (!previewHtml) return;
    onApply(formatRoleSpeechHtml(previewHtml, authorRole));
    setPreviewHtml(null);
    setSelected([]);
    setExtraNote("");
    toast.success("Applied to your draft — save the story when ready");
  };

  const discardPreview = () => {
    setPreviewHtml(null);
    toast.message("Preview discarded — your draft is unchanged");
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
          <p className="text-sm font-medium text-ivory">AI rewrite</p>
          <p className="text-xs text-muted-foreground">
            Tag prompts to improve the draft. You&apos;ll see a preview first —
            accept it, or send more prompts to refine before it touches your
            editor.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Model</Label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || rewriting}
            onClick={() => setProvider("claude")}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs transition-colors",
              provider === "claude"
                ? "border-gold/50 bg-gold/15 text-gold"
                : "border-gold/15 bg-void/40 text-ivory/70 hover:border-gold/30 hover:text-ivory"
            )}
          >
            Claude
          </button>
          <button
            type="button"
            disabled={disabled || rewriting}
            onClick={() => setProvider("grok")}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs transition-colors",
              provider === "grok"
                ? "border-gold/50 bg-gold/15 text-gold"
                : "border-gold/15 bg-void/40 text-ivory/70 hover:border-gold/30 hover:text-ivory"
            )}
          >
            Grok 4.5
          </button>
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

      <div className="space-y-1.5">
        <Label htmlFor="story-rewrite-note" className="text-xs text-muted-foreground">
          Extra fix note (optional)
        </Label>
        <Textarea
          id="story-rewrite-note"
          value={extraNote}
          onChange={(e) => setExtraNote(e.target.value)}
          rows={2}
          disabled={disabled || rewriting}
          placeholder={
            previewHtml
              ? "e.g. Soften the ending / keep the dialogue / more teasing…"
              : `Optional note for ${providerLabel}…`
          }
          className="border-gold/20 bg-void/60 text-sm"
        />
      </div>

      <Button
        type="button"
        size="sm"
        disabled={
          disabled ||
          rewriting ||
          (selected.length === 0 && !extraNote.trim())
        }
        onClick={() => void rewrite()}
        className="bg-gold text-void hover:bg-gold-muted"
      >
        {rewriting ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-3.5 w-3.5" />
        )}
        {previewHtml
          ? `Refine with ${providerLabel}`
          : `Rewrite with ${providerLabel}`}
        {selected.length > 0 ? ` (${selected.length})` : ""}
      </Button>

      {previewHtml && (
        <div className="space-y-3 rounded-lg border border-gold/30 bg-void/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wider text-gold">
              {providerLabel} preview — not saved yet
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                disabled={disabled || rewriting}
                onClick={acceptPreview}
                className="h-7 bg-gold px-2 text-xs text-void hover:bg-gold-muted"
              >
                <Check className="mr-1 h-3 w-3" />
                Use this version
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || rewriting}
                onClick={discardPreview}
                className="h-7 border-gold/25 px-2 text-xs"
              >
                <X className="mr-1 h-3 w-3" />
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || rewriting}
                onClick={() => {
                  setSelected([]);
                  setExtraNote("");
                }}
                className="h-7 px-2 text-xs text-muted-foreground"
                title="Clear selected tags"
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Clear tags
              </Button>
            </div>
          </div>
          <StoryHtmlView html={previewHtml} className="max-h-80 overflow-y-auto" />
          <p className="text-[11px] text-muted-foreground">
            Tag more prompts or add a fix note above, then refine — your
            original draft stays until you click Use this version.
          </p>
        </div>
      )}
    </div>
  );
}
