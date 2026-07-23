"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { TeaseBegThread } from "@/components/teases/tease-beg-thread";
import { Button } from "@/components/ui/button";
import type { TeaseMediaKind } from "@/lib/types";

/** Avoid mounting beg/voice realtime channels until Queen/D opens the thread. */
export function LazyTeaseThread({
  teaseId,
  teaseTitle,
  mediaKind = "image",
  defaultOpen = false,
  highlightCommentId = null,
  highlightVoiceId = null,
}: {
  teaseId: string;
  teaseTitle?: string | null;
  mediaKind?: TeaseMediaKind;
  defaultOpen?: boolean;
  highlightCommentId?: string | null;
  highlightVoiceId?: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full border-gold/25 text-ivory/80 hover:border-gold/40 hover:bg-gold/5"
      >
        <MessageCircle className="mr-2 h-3.5 w-3.5 text-gold" />
        Show replies & voice
      </Button>
    );
  }

  return (
    <TeaseBegThread
      teaseId={teaseId}
      teaseTitle={teaseTitle}
      mediaKind={mediaKind}
      highlightCommentId={highlightCommentId}
      highlightVoiceId={highlightVoiceId}
    />
  );
}
