"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Pin, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getYouTubeEmbedUrl, isValidYouTubeUrl } from "@/lib/youtube";
import { formatRoleSpeech } from "@/lib/role-speech";
import type { QueenDate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type DateExtrasDraft = {
  thoughts: string;
  youtube: string;
};

export function extrasFromDate(d: QueenDate): DateExtrasDraft {
  return {
    thoughts: d.thoughts_text ?? "",
    youtube: d.youtube_url ?? "",
  };
}

interface DateFeaturedContentProps {
  date: QueenDate;
  isQueen: boolean;
  draft?: DateExtrasDraft;
  onDraftChange?: (patch: Partial<DateExtrasDraft>) => void;
  onSaved?: () => void;
  className?: string;
}

export function DateFeaturedContent({
  date,
  isQueen,
  draft,
  onDraftChange,
  onSaved,
  className,
}: DateFeaturedContentProps) {
  const [saving, setSaving] = useState(false);

  const thoughts = draft?.thoughts ?? date.thoughts_text ?? "";
  const youtube = draft?.youtube ?? date.youtube_url ?? "";
  const displayYoutube = youtube.trim() || date.youtube_url || "";
  const embedUrl =
    displayYoutube && isValidYouTubeUrl(displayYoutube)
      ? getYouTubeEmbedUrl(displayYoutube)
      : null;

  const saveExtras = async () => {
    if (!isQueen) return;
    const yt = youtube.trim();
    if (yt && !isValidYouTubeUrl(yt)) {
      toast.error("Enter a valid YouTube URL, or clear it");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("queen_dates")
      .update({
        thoughts_text: thoughts.trim()
          ? formatRoleSpeech(thoughts.trim(), "queen")
          : null,
        youtube_url: yt || null,
      })
      .eq("id", date.id);

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Date notes & video saved");
    onSaved?.();
  };

  if (!isQueen && !date.youtube_url) {
    return null;
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-lg border border-gold/10 bg-void/40 p-4",
        className
      )}
    >
      {isQueen && (
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gold/90">
            Private notes &amp; featured video
          </p>
          <p className="text-xs text-muted-foreground">
            Separate from the live timeline — only you see private notes; both
            see the pinned video.
          </p>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-gold" />
              Private thoughts (Queen only)
            </Label>
            <Textarea
              value={thoughts}
              onChange={(e) => onDraftChange?.({ thoughts: e.target.value })}
              rows={3}
              placeholder="Only for you — plans, reminders, how you want to remember this date…"
              className="border-gold/20 bg-void/60"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Pin className="h-3.5 w-3.5 text-gold" />
              Featured YouTube (pinned on this date)
            </Label>
            <Input
              value={youtube}
              onChange={(e) => onDraftChange?.({ youtube: e.target.value })}
              placeholder="https://youtube.com/watch?v=…"
              className="border-gold/20 bg-void/60"
            />
          </div>

          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void saveExtras()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {saving ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            Save notes &amp; video
          </Button>
        </div>
      )}

      {embedUrl && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Pin className="h-3 w-3 text-gold" />
            Featured video
          </p>
          <div className="overflow-hidden rounded-xl border border-gold/15">
            <div className="relative aspect-video w-full">
              <iframe
                src={embedUrl}
                title="Featured date video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 size-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
