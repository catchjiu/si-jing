"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Mic, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile, VoiceEntityType, VoiceNote } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { removeObject } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { VoicePlayer } from "@/components/voice/voice-player";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { KeepInEvidenceButton } from "@/components/evidence/keep-in-evidence-button";
import type { MessageAttachmentType, InboxTopic } from "@/lib/inbox";
import { inboxConversationHref, notifyWorshipThread, postToTopicThread } from "@/lib/inbox";
import { notifyPush } from "@/lib/push-client";
import { Button } from "@/components/ui/button";

type VoiceNoteWithAuthor = VoiceNote & {
  author?: Pick<Profile, "id" | "username" | "avatar_url" | "role"> | null;
};

interface VoiceNotesProps {
  entityType: VoiceEntityType;
  entityId: string;
  className?: string;
  title?: string;
  /** Hide the section heading */
  compact?: boolean;
  /** Queen can pin notes into Evidence (date/tease voices) */
  allowEvidencePin?: boolean;
  evidenceTitle?: string;
  /** Mirror new recordings into an inbox topic thread */
  mirrorToInbox?: {
    topic: InboxTopic;
    attachmentType: MessageAttachmentType;
    attachmentId: string;
  };
}

export function VoiceNotes({
  entityType,
  entityId,
  className,
  title = "Voice messages",
  compact = false,
  allowEvidencePin = false,
  evidenceTitle,
  mirrorToInbox,
}: VoiceNotesProps) {
  const { profile, isQueen, isSlave } = useAuth();
  const [notes, setNotes] = useState<VoiceNoteWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("voice_notes")
      .select("*, author:users!created_by(id, username, avatar_url, role)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load voice messages");
      setLoading(false);
      return;
    }

    setNotes((data as VoiceNoteWithAuthor[]) ?? []);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    void load();

    const supabase = createClient();
    const channel = supabase
      .channel(`voice:${entityType}:${entityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "voice_notes",
          filter: `entity_id=eq.${entityId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [entityType, entityId, load]);

  const remove = async (note: VoiceNoteWithAuthor) => {
    const supabase = createClient();
    await removeObject({ bucket: "voice", path: note.file_path });
    const { error } = await supabase
      .from("voice_notes")
      .delete()
      .eq("id", note.id);
    if (error) {
      toast.error("Could not delete voice message");
      return;
    }
    toast.success("Voice message removed");
    void load();
  };

  return (
    <section className={cn("space-y-4", className)}>
      {!compact && (
        <h2 className="font-heading flex items-center gap-2 text-xl text-gold">
          <Mic className="size-5" />
          {title}
        </h2>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading voice…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No voice messages yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => {
            const canDelete =
              profile?.id === note.created_by || isQueen;
            return (
              <li
                key={note.id}
                className="rounded-xl border border-gold/10 bg-charcoal/70 p-3 sm:p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm text-ivory">
                    {note.author?.username ?? "Someone"}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatRelative(note.created_at)}
                    </span>
                  </p>
                  <div className="flex items-center gap-1">
                    {allowEvidencePin && isQueen && (
                      <KeepInEvidenceButton
                        sourceType="voice_note"
                        sourceId={note.id}
                        mediaKind="voice"
                        title={evidenceTitle || `${title} voice`}
                        filePath={note.file_path}
                        storageBucket="voice"
                        label="Keep"
                        className="h-8 px-2 text-xs"
                      />
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-red-400"
                        onClick={() => void remove(note)}
                        aria-label="Delete voice message"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <VoicePlayer
                  filePath={note.file_path}
                  durationMs={note.duration_ms}
                />
              </li>
            );
          })}
        </ul>
      )}

      <VoiceRecorder
        entityType={entityType}
        entityId={entityId}
        onUploaded={() => {
          void load();
          if (mirrorToInbox && profile) {
            const supabase = createClient();
            if (mirrorToInbox.topic === "worship") {
              void notifyWorshipThread(supabase, {
                senderId: profile.id,
                content: "Voice message",
                galleryId: mirrorToInbox.attachmentId,
                pushTitle: isSlave ? "Voice on worship" : "Queen voice on worship",
                pushBody: "New voice in Worship",
                notifyTarget: isSlave ? "queen" : "slave",
              });
            } else {
              void postToTopicThread(supabase, {
                topic: mirrorToInbox.topic,
                senderId: profile.id,
                content: "Voice message",
                attachmentType: mirrorToInbox.attachmentType,
                attachmentId: mirrorToInbox.attachmentId,
              }).then((dm) => {
                void notifyPush({
                  title: "New voice message",
                  body: "Voice in inbox thread",
                  url: dm
                    ? inboxConversationHref(dm.conversation_id)
                    : "/dashboard/inbox",
                  target: isSlave ? "queen" : "slave",
                });
              });
            }
          }
        }}
        compact={compact}
      />
    </section>
  );
}
