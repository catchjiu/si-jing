"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StoryCoverButtonProps = {
  storyId: string;
  hasCover?: boolean;
  onGenerated?: () => void;
  className?: string;
};

export function StoryCoverButton({
  storyId,
  hasCover,
  onGenerated,
  className,
}: StoryCoverButtonProps) {
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/story/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId }),
      });
      const data = (await res.json()) as {
        error?: string;
        usedFaceRefs?: string[];
      };
      if (!res.ok) throw new Error(data.error || "Cover generation failed");
      const faces = data.usedFaceRefs?.length
        ? ` (used ${data.usedFaceRefs.join(" + ")} face refs)`
        : " — tip: upload face refs in Profile for likeness";
      toast.success(`Blog cover ready${faces}`);
      onGenerated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cover failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() => void generate()}
      className={cn("border-gold/25 text-xs", className)}
    >
      {busy ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
      )}
      {hasCover ? "Regenerate cover" : "Generate Grok cover"}
    </Button>
  );
}
