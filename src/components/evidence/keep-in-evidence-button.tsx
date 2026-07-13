"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import {
  isPinned,
  pinEvidence,
  unpinEvidence,
  type PinEvidenceInput,
} from "@/lib/evidence-pins";
import type { EvidencePinMediaKind, EvidencePinSourceType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  sourceType: EvidencePinSourceType;
  sourceId: string;
  mediaKind: EvidencePinMediaKind;
  title: string;
  caption?: string | null;
  youtubeUrl?: string | null;
  filePath?: string | null;
  storageBucket?:
    | "teases"
    | "voice"
    | "submissions"
    | "date_posts"
    | "messages"
    | null;
  meta?: Record<string, unknown> | null;
  label?: string;
  className?: string;
  size?: "sm" | "default";
};

export function KeepInEvidenceButton({
  sourceType,
  sourceId,
  mediaKind,
  title,
  caption,
  youtubeUrl,
  filePath,
  storageBucket,
  meta,
  label = "Keep in Evidence",
  className,
  size = "sm",
}: Props) {
  const { profile, isQueen } = useAuth();
  const [pinId, setPinId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isQueen || !sourceId) return;
    let cancelled = false;
    void (async () => {
      const id = await isPinned(sourceType, sourceId, mediaKind);
      if (!cancelled) {
        setPinId(id);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isQueen, sourceType, sourceId, mediaKind]);

  if (!isQueen || !profile) return null;

  const toggle = async () => {
    setBusy(true);
    if (pinId) {
      const { error } = await unpinEvidence(pinId);
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setPinId(null);
      toast.success("Removed from Evidence");
      return;
    }

    const input: PinEvidenceInput = {
      pinnedBy: profile.id,
      sourceType,
      sourceId,
      mediaKind,
      title,
      caption,
      youtubeUrl,
      filePath,
      storageBucket,
      meta,
    };
    const result = await pinEvidence(input);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.already) {
      toast.message("Already in Evidence");
      const id = await isPinned(sourceType, sourceId, mediaKind);
      setPinId(id);
      return;
    }
    const id = await isPinned(sourceType, sourceId, mediaKind);
    setPinId(id);
    toast.success("Kept in Evidence");
  };

  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      disabled={busy || !ready}
      onClick={() => void toggle()}
      className={cn(
        pinId
          ? "border-gold/50 bg-gold/10 text-gold hover:bg-gold/15"
          : "border-gold/25 text-ivory hover:border-gold/50 hover:bg-void/60",
        className
      )}
    >
      {busy ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : pinId ? (
        <BookmarkCheck className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <Bookmark className="mr-1.5 h-3.5 w-3.5" />
      )}
      {pinId ? "Kept" : label}
    </Button>
  );
}
