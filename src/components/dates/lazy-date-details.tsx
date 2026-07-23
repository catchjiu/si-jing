"use client";

import { useState } from "react";
import { CalendarHeart } from "lucide-react";
import { DateTimeline } from "@/components/dates/date-timeline";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { Button } from "@/components/ui/button";

/** Defer timeline + voice realtime until the date card is expanded. */
export function LazyDateDetails({
  dateId,
  dateTitle,
  canPost,
  onPosted,
  defaultOpen = false,
  highlightVoiceId = null,
}: {
  dateId: string;
  dateTitle?: string | null;
  canPost: boolean;
  onPosted?: () => void;
  defaultOpen?: boolean;
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
        <CalendarHeart className="mr-2 h-3.5 w-3.5 text-gold" />
        Show timeline & voice
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <DateTimeline
        dateId={dateId}
        dateTitle={dateTitle}
        canPost={canPost}
        onPosted={onPosted}
      />
      <VoiceNotes
        entityType="date"
        entityId={dateId}
        compact
        highlightVoiceId={highlightVoiceId}
        title="Voice"
        allowEvidencePin
        evidenceTitle={dateTitle ? `Date · ${dateTitle}` : "Date voice"}
      />
    </div>
  );
}
