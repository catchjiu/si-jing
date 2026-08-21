"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleSpeechHtml } from "@/lib/role-speech";
import {
  appendStoryHtml,
  sanitizeStoryHtml,
} from "@/lib/sanitize-html";
import type { StoryAiProvider } from "@/components/story/story-provider-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StoryHtmlView } from "@/components/story/story-rich-text-editor";
import {
  StoryProviderPicker,
  storyProviderLabel,
} from "@/components/story/story-provider-picker";

type StoryExtendDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyId?: string;
  title: string;
  html: string;
  /** When true, append + save to the database. Otherwise only return HTML. */
  persist?: boolean;
  onApplied: (combinedHtml: string) => void;
};

export function StoryExtendDialog({
  open,
  onOpenChange,
  storyId,
  title,
  html,
  persist = false,
  onApplied,
}: StoryExtendDialogProps) {
  const { profile } = useAuth();
  const [provider, setProvider] = useState<StoryAiProvider>("claude");
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [combinedHtml, setCombinedHtml] = useState<string | null>(null);

  const reset = () => {
    setPreviewHtml(null);
    setCombinedHtml(null);
    setDirection("");
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const extend = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/story/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "extend",
          html,
          title,
          direction: direction.trim() || undefined,
          provider,
        }),
      });
      const data = (await res.json()) as {
        html?: string;
        combinedHtml?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not extend the story");
      if (!data.html) throw new Error("No continuation returned");

      const continuation = formatRoleSpeechHtml(
        sanitizeStoryHtml(data.html),
        profile?.role
      );
      const combined = formatRoleSpeechHtml(
        data.combinedHtml
          ? sanitizeStoryHtml(data.combinedHtml)
          : appendStoryHtml(html, continuation),
        profile?.role
      );
      setPreviewHtml(continuation);
      setCombinedHtml(combined);
      toast.success(
        `${storyProviderLabel(provider)} continuation ready — append it, or add more direction and run again`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not extend the story"
      );
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!combinedHtml) return;
    if (!persist) {
      onApplied(combinedHtml);
      close(false);
      toast.success("Continuation added to your draft — save the story when ready");
      return;
    }
    if (!storyId || !profile) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("stories")
        .update({
          body: combinedHtml,
          updated_at: new Date().toISOString(),
        })
        .eq("id", storyId)
        .eq("author_id", profile.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Could not save extension");
      toast.success("Story extended");
      onApplied(combinedHtml);
      close(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save extension");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="font-heading text-ivory">
            Extend story
          </DialogTitle>
          <DialogDescription>
            Optional direction for what happens next. Leave it blank to continue
            naturally from the last scene.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="truncate text-xs text-muted-foreground">
            Continuing: {title}
          </p>

          <StoryProviderPicker
            value={provider}
            onChange={setProvider}
            disabled={busy || saving}
          />

          <div className="space-y-1.5">
            <Label
              htmlFor="story-extend-direction"
              className="text-xs text-muted-foreground"
            >
              Direction (optional)
            </Label>
            <Textarea
              id="story-extend-direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              rows={4}
              disabled={busy || saving}
              placeholder="e.g. They go back to her hotel. She makes him wait. More dialogue, slower, filthier…"
              className="border-gold/20 bg-void/60 text-sm"
            />
          </div>

          <Button
            type="button"
            disabled={busy || saving}
            onClick={() => void extend()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {previewHtml
              ? `Rewrite continuation with ${storyProviderLabel(provider)}`
              : `Extend with ${storyProviderLabel(provider)}`}
          </Button>

          {previewHtml && (
            <div className="space-y-3 rounded-lg border border-gold/30 bg-void/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gold">
                New continuation — not saved yet
              </p>
              <StoryHtmlView
                html={previewHtml}
                className="max-h-64 overflow-y-auto text-sm"
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || saving}
                  onClick={() => void apply()}
                  className="h-7 bg-gold px-2 text-xs text-void hover:bg-gold-muted"
                >
                  {saving ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-3 w-3" />
                  )}
                  Append to story
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || saving}
                  onClick={() => {
                    setPreviewHtml(null);
                    setCombinedHtml(null);
                  }}
                  className="h-7 border-gold/25 px-2 text-xs"
                >
                  <X className="mr-1 h-3 w-3" />
                  Discard
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
