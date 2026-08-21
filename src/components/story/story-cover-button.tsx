"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

type StoryCoverButtonProps = {
  storyId: string;
  hasCover?: boolean;
  lastPrompt?: string | null;
  onGenerated?: () => void;
  className?: string;
};

export function StoryCoverButton({
  storyId,
  hasCover,
  lastPrompt,
  onGenerated,
  className,
}: StoryCoverButtonProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(lastPrompt ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setPrompt(lastPrompt ?? "");
  }, [open, lastPrompt]);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/story/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId,
          prompt: prompt.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        usedFaceRefs?: string[];
        cover_prompt?: string;
      };
      if (!res.ok) throw new Error(data.error || "Cover generation failed");
      const faces = data.usedFaceRefs?.length
        ? ` (used ${data.usedFaceRefs.join(" + ")} face refs)`
        : " — tip: upload face refs in Profile for likeness";
      toast.success(`Blog cover ready${faces}`);
      if (data.cover_prompt) setPrompt(data.cover_prompt);
      setOpen(false);
      onGenerated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cover failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => setOpen(true)}
        className={cn("border-gold/25 text-xs", className)}
      >
        {busy ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
        )}
        {hasCover ? "Regenerate cover" : "Generate cover"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle className="font-heading text-ivory">
              {hasCover ? "Regenerate cover" : "Generate cover"}
            </DialogTitle>
            <DialogDescription>
              Describe the image. Leave it blank to let Grok invent a cover from
              the story.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor={`story-cover-prompt-${storyId}`}
                className="text-xs text-muted-foreground"
              >
                Image prompt
              </Label>
              <Textarea
                id={`story-cover-prompt-${storyId}`}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                disabled={busy}
                placeholder="e.g. Rainy Penn Station at night. Queen in a black coat looking back, D waiting on the platform. Cinematic, wet asphalt reflections, her face from the reference."
                className="border-gold/20 bg-void/60 text-sm"
              />
            </div>

            <Button
              type="button"
              disabled={busy}
              onClick={() => void generate()}
              className="bg-gold text-void hover:bg-gold-muted"
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              {busy ? "Generating…" : "Generate with Grok"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
