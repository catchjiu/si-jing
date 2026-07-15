"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Profile } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { notifyWorshipThread } from "@/lib/inbox";
import { presignAndUpload, signObjectUrl } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { RoleSpeech } from "@/components/ui/role-speech";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024;

type WorshipMessage = {
  id: string;
  worship_id: string;
  author_id: string;
  content: string | null;
  image_path: string | null;
  created_at: string;
  author?: Pick<Profile, "id" | "username" | "role"> | null;
  signedUrl?: string;
};

interface WorshipCommentThreadProps {
  worshipId: string;
  galleryId: string;
  worshipTitle?: string | null;
  className?: string;
}

export function WorshipCommentThread({
  worshipId,
  galleryId,
  worshipTitle,
  className,
}: WorshipCommentThreadProps) {
  const { profile, isSlave } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<WorshipMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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
      .from("worship_messages")
      .select("*, author:users!author_id(id, username, role)")
      .eq("worship_id", worshipId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Could not load comments");
      setLoading(false);
      return;
    }

    const rows = (data as WorshipMessage[]) ?? [];
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
  }, [worshipId]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel(`worship-messages:${worshipId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "worship_messages",
          filter: `worship_id=eq.${worshipId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [worshipId, load]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const canSend = Boolean(draft.trim() || file);

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
          relativePath: `${profile.id}/comments/${worshipId}/${Date.now()}.${ext}`,
        });
      }

      const text = draft.trim()
        ? formatRoleSpeech(draft.trim(), profile.role)
        : null;

      const { error } = await supabase.from("worship_messages").insert({
        worship_id: worshipId,
        author_id: profile.id,
        content: text,
        image_path: imagePath,
      });
      if (error) throw error;

      const notifyBody = text || (imagePath ? "Sent a photo" : "");
      setDraft("");
      clearImage();
      void load();
      void notifyWorshipThread(supabase, {
        senderId: profile.id,
        content: notifyBody,
        galleryId,
        pushTitle: isSlave ? "Comment on worship" : "Queen commented on worship",
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
        Comments
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const mine = m.author_id === profile?.id;
            const isQueenAuthor = m.author?.role === "queen";
            return (
              <li
                key={m.id}
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
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelative(m.created_at)}
                  </span>
                </div>
                {m.content && (
                  <p className="whitespace-pre-wrap text-sm text-ivory/90">
                    <RoleSpeech text={m.content} role={m.author?.role} />
                  </p>
                )}
                {m.signedUrl && (
                  <WatermarkedFrame className="mt-2 rounded-lg border border-gold/15">
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
              ? "Add to your worship or respond to Queen…"
              : "Reply to his worship…"
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
        entityType="worship"
        entityId={worshipId}
        compact
        mirrorToInbox={{
          topic: "worship",
          attachmentType: "worship",
          attachmentId: galleryId,
        }}
        title={
          isSlave
            ? "Voice comment"
            : `Voice on ${worshipTitle || "worship"}`
        }
      />
    </div>
  );
}
