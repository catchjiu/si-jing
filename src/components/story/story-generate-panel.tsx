"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, WandSparkles } from "lucide-react";
import { formatRoleSpeechHtml } from "@/lib/role-speech";
import { sanitizeStoryHtml } from "@/lib/sanitize-html";
import type { StoryAiProvider } from "@/components/story/story-provider-picker";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  StoryProviderPicker,
  storyProviderLabel,
} from "@/components/story/story-provider-picker";

type StoryGeneratePanelProps = {
  titleHint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Restored prompt from an in-progress draft. */
  promptValue?: string;
  onPromptChange?: (prompt: string) => void;
  onGenerated: (result: { title: string; html: string }) => void;
  className?: string;
};

export function StoryGeneratePanel({
  titleHint,
  disabled,
  autoFocus,
  promptValue,
  onPromptChange,
  onGenerated,
  className,
}: StoryGeneratePanelProps) {
  const { profile } = useAuth();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [provider, setProvider] = useState<StoryAiProvider>("claude");
  const [uncontrolledPrompt, setUncontrolledPrompt] = useState(promptValue ?? "");
  const prompt = promptValue ?? uncontrolledPrompt;
  const setPrompt = (next: string) => {
    if (promptValue === undefined) setUncontrolledPrompt(next);
    onPromptChange?.(next);
  };
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("Describe the story you want written");
      promptRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/story/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          prompt: trimmed,
          title: titleHint?.trim() || undefined,
          provider,
        }),
      });
      const data = (await res.json()) as {
        title?: string;
        html?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not write the story");
      if (!data.html) throw new Error("No story returned");

      onGenerated({
        title: (data.title ?? "").trim(),
        html: formatRoleSpeechHtml(
          sanitizeStoryHtml(data.html),
          profile?.role
        ),
      });
      toast.success(
        `${storyProviderLabel(provider)} drafted the story — edit it below, then save`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not write the story");
    } finally {
      setBusy(false);
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
        <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <div>
          <p className="text-sm font-medium text-ivory">Write from a prompt</p>
          <p className="text-xs text-muted-foreground">
            Describe the plot, tone, characters, and how it should end. A full
            story is drafted into the editor for you to review.
          </p>
        </div>
      </div>

      <StoryProviderPicker
        value={provider}
        onChange={setProvider}
        disabled={disabled || busy}
      />

      <div className="space-y-1.5">
        <Label htmlFor="story-generate-prompt" className="text-xs text-muted-foreground">
          Prompt
        </Label>
        <Textarea
          ref={promptRef}
          id="story-generate-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          disabled={disabled || busy}
          autoFocus={autoFocus}
          placeholder="e.g. Rainy Penn Station. Queen finds D waiting. Slow, filthy, she stays in control. End with her leaving him wanting."
          className="border-gold/20 bg-void/60 text-sm"
        />
      </div>

      <Button
        type="button"
        size="sm"
        disabled={disabled || busy || !prompt.trim()}
        onClick={() => void generate()}
        className="bg-gold text-void hover:bg-gold-muted"
      >
        {busy ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-3.5 w-3.5" />
        )}
        {busy
          ? `Writing with ${storyProviderLabel(provider)}…`
          : `Write story with ${storyProviderLabel(provider)}`}
      </Button>
    </div>
  );
}
