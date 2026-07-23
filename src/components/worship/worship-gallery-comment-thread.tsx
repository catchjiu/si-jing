"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Loader2, Send, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { notifyWorshipThread } from "@/lib/inbox";
import { inboxAnchors, highlightMessageElement } from "@/lib/inbox-deep-links";
import { presignAndUpload, removeObject, signObjectUrl } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { RoleSpeech } from "@/components/ui/role-speech";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { KeepInEvidenceButton } from "@/components/evidence/keep-in-evidence-button";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024;

type WorshipGalleryMessage = {
  id: string;
  gallery_id: string;
  author_id: string;
  content: string | null;
  image_path: string | null;
  created_at: string;
  author?: Pick<Profile, "id" | "username" | "role"> | null;
  signedUrl?: string;
};

interface WorshipGalleryCommentThreadProps {
  galleryId: string;
  galleryTopic?: string | null;
  highlightCommentId?: string | null;
  highlightVoiceId?: string | null;
  className?: string;
}

export function WorshipGalleryCommentThread({
  galleryId,
  galleryTopic,
  highlightCommentId = null,
  highlightVoiceId = null,
  className,
}: WorshipGalleryCommentThreadProps) {
  const { profile, isSlave, isQueen } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<WorshipGalleryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const clearImage = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [preview]);

  const pickImage = (incoming: FileList | File[] | null) => {
    const candidate = incoming?.[0];
    if (!candidate) return;
    if (!ACCEPTED.includes(candidate.type)) {
      toast.error("Use a JPG, PNG, WebP, or GIF");
      return;
    }
    if (candidate.size > MAX_SIZE) {
      toast.error("Image must be under 10MB");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(candidate);
    setPreview(URL.createObjectURL(candidate));
  };

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("worship_gallery_messages")
      .select("*, author:users!author_id(id, username, role)")
      .eq("gallery_id", galleryId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load gallery comments");
      setLoading(false);
      return;
    }

    const rows = (data as WorshipGalleryMessage[]) ?? [];
    const withUrls = await Promise.all(
      rows.map(async (m) => {
        if (!m.image_path) return m;
        const signedUrl =
          (await signObjectUrl({
            bucket: "worship",
            path: m.image_path,
          })) ?? undefined;
        return { ...m, signedUrl };
      })
    );
    setMessages(withUrls);
    setLoading(false);
  }, [galleryId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`worship-gallery-messages:${galleryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "worship_gallery_messages",
          filter: `gallery_id=eq.${galleryId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [galleryId, load]);

  useEffect(() => {
    if (!highlightCommentId || loading) return;
    const timer = window.setTimeout(() => {
      highlightMessageElement(highlightCommentId);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [highlightCommentId, loading, messages.length]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const canSend = Boolean(draft.trim() || file);

  const removeComment = async (message: WorshipGalleryMessage) => {
    if (!profile) return;
    const canDelete = message.author_id === profile.id || isQueen;
    if (!canDelete) return;
    if (!window.confirm("Delete this comment?")) return;

    setDeletingId(message.id);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("worship_gallery_messages")
        .delete()
        .eq("id", message.id);
      if (error) throw error;
      if (message.image_path) {
        try {
          await removeObject({ bucket: "worship", path: message.image_path });
        } catch {
          // Row is gone; storage cleanup is best-effort
        }
      }
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      toast.success("Comment deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setDeletingId(null);
    }
  };

  const send = async () => {
    if (!profile || !canSend) return;
    setSending(true);
    const supabase = createClient();
    try {
      let imagePath: string | null = null;
      if (file) {
        const uploadFile = await downsizeImageIfNeeded(file);
        const ext = uploadFile.name.split(".").pop() || "jpg";
        imagePath = await presignAndUpload({
          bucket: "worship",
          file: uploadFile,
          contentType: uploadFile.type || "image/jpeg",
          ext,
          relativePath: `${profile.id}/gallery-comments/${galleryId}/${Date.now()}.${ext}`,
        });
      }

      const text = draft.trim()
        ? formatRoleSpeech(draft.trim(), profile.role)
        : null;

      const { data: inserted, error } = await supabase
        .from("worship_gallery_messages")
        .insert({
          gallery_id: galleryId,
          author_id: profile.id,
          content: text,
          image_path: imagePath,
        })
        .select("id")
        .single();
      if (error) throw error;

      const notifyBody = text || (imagePath ? "Sent a photo" : "");
      setDraft("");
      clearImage();
      void load();
      void notifyWorshipThread(supabase, {
        senderId: profile.id,
        content: notifyBody,
        galleryId,
        attachmentAnchor: inserted?.id
          ? inboxAnchors.worshipGalleryComment(inserted.id)
          : null,
        pushTitle: isSlave
          ? "Comment on worship gallery"
          : "Queen commented on gallery",
        pushBody: notifyBody.slice(0, 120),
        notifyTarget: isSlave ? "queen" : "slave",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn("space-y-4 border-t border-gold/10 pt-4", className)}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Gallery comments
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments on this gallery yet.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const mine = m.author_id === profile?.id;
            const isQueenAuthor = m.author?.role === "queen";
            const canDelete = mine || isQueen;
            return (
              <li
                key={m.id}
                id={`inbox-focus-${m.id}`}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  mine
                    ? "ml-3 border-gold/25 bg-gold/5"
                    : "mr-3 border-royal/40 bg-royal/15"
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      isQueenAuthor ? "text-gold" : "text-ivory/80"
                    )}
                  >
                    {m.author?.username ?? "Someone"}
                    {isQueenAuthor ? " · Queen" : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelative(m.created_at)}
                    </span>
                    {isQueen && (m.image_path || m.content) && (
                      <KeepInEvidenceButton
                        sourceType="worship_gallery_message"
                        sourceId={m.id}
                        mediaKind={m.image_path ? "image" : "text"}
                        title={
                          galleryTopic
                            ? `Gallery · ${galleryTopic}`
                            : "Gallery comment"
                        }
                        caption={m.content}
                        filePath={m.image_path}
                        storageBucket={m.image_path ? "worship" : null}
                        label="Keep"
                        className="h-7 px-2 text-[11px]"
                      />
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                        disabled={deletingId === m.id}
                        aria-label="Delete comment"
                        onClick={() => void removeComment(m)}
                      >
                        {deletingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                {m.content && (
                  <p className="whitespace-pre-wrap text-sm text-ivory/90">
                    <RoleSpeech text={m.content} role={m.author?.role} />
                  </p>
                )}
                {m.signedUrl && (
                  <WatermarkedFrame
                    className="mt-2 rounded-lg border border-gold/15"
                    mediaPath={m.image_path}
                  >
                    <a
                      href={m.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <Image
                        src={m.signedUrl}
                        alt="Comment photo"
                        width={640}
                        height={640}
                        className="h-auto max-h-72 w-full object-contain bg-void"
                        unoptimized
                      />
                    </a>
                  </WatermarkedFrame>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        {preview && (
          <div className="relative inline-block overflow-hidden rounded-lg border border-gold/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Selected"
              className="h-28 w-auto max-w-full object-cover"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute right-1 top-1 rounded-full bg-void/80 p-1 text-ivory"
              aria-label="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={
            isSlave
              ? "Notes about this collection…"
              : "Reply on this gallery…"
          }
          className="border-gold/20 bg-void/60"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => pickImage(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-gold/25"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
          >
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            Photo
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={sending || !canSend}
            onClick={() => void send()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {sending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-2 h-3.5 w-3.5" />
            )}
            Send comment
          </Button>
        </div>
      </div>

      <VoiceNotes
        entityType="worship_gallery"
        entityId={galleryId}
        compact
        highlightVoiceId={highlightVoiceId}
        mirrorToInbox={{
          topic: "worship",
          attachmentType: "worship",
          attachmentId: galleryId,
        }}
        title={
          isSlave
            ? "Voice on gallery"
            : `Voice on ${galleryTopic || "gallery"}`
        }
      />
    </div>
  );
}
