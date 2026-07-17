"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  ImagePlus,
  ListTodo,
  Loader2,
  Mic,
  Plus,
  Reply,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleSpeech } from "@/lib/role-speech";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { prepareVideoForUpload } from "@/lib/video-compress";
import { presignAndUpload } from "@/lib/storage/client";
import { normalizeVoiceBlob } from "@/lib/voice-format";
import { pickRecorderMimeType } from "@/lib/voice-format";
import {
  messageSnippet,
  postTeaseToInboxes,
  postToTopicThread,
  sendDirectMessage,
  type DirectMessageWithSender,
  type MessageAttachmentType,
} from "@/lib/inbox";
import { notifyPush } from "@/lib/push-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskForm } from "@/components/tasks/task-form";
import { PunishmentForm } from "@/components/punishments/punishment-form";
import { InboxTeaseForm } from "@/components/inbox/inbox-tease-form";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

interface ChatComposerProps {
  conversationId: string;
  recipientId: string;
  contactBlocked?: boolean;
  replyingTo?: DirectMessageWithSender | null;
  onCancelReply?: () => void;
  onSent?: () => void;
  className?: string;
}

type SheetKind = "tease" | "task" | "punishment" | null;

export function ChatComposer({
  conversationId,
  recipientId,
  contactBlocked = false,
  replyingTo = null,
  onCancelReply,
  onSent,
  className,
}: ChatComposerProps) {
  const { profile, isQueen } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef(0);

  const blocked = contactBlocked && !isQueen;

  const notifyRecipient = async (
    title: string,
    body: string | null,
    href: string
  ) => {
    if (!profile) return;
    void notifyPush({
      title,
      body: body ?? "",
      url: href,
      target: profile.role === "queen" ? "slave" : "queen",
      kind: "message",
    });
  };

  const gateSlaveMessage = async (
    supabase: ReturnType<typeof createClient>
  ): Promise<boolean> => {
    if (isQueen) return true;
    const { consumeAttention } = await import("@/lib/attention-budget");
    const gate = await consumeAttention(supabase, "message");
    if (!gate.ok) {
      toast.error(gate.error ?? "Daily message limit reached");
      return false;
    }
    if (gate.used_token) {
      toast.message("Used a speak-freely token");
    }
    return true;
  };

  const sendText = async () => {
    if (!profile || !draft.trim() || blocked) return;
    setSending(true);
    const supabase = createClient();
    try {
      const text = formatRoleSpeech(draft.trim(), profile.role);
      if (!(await gateSlaveMessage(supabase))) return;
      await sendDirectMessage(supabase, {
        conversationId,
        senderId: profile.id,
        content: text,
        replyToId: replyingTo?.id ?? null,
      });
      setDraft("");
      onCancelReply?.();
      await notifyRecipient(
        profile.role === "queen" ? "Message from Queen" : "Message from D",
        text.slice(0, 120),
        `/dashboard/inbox/${conversationId}`
      );
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (file: File) => {
    if (!profile || blocked) return;
    const isImage = IMAGE_TYPES.includes(file.type);
    const isVideo = VIDEO_TYPES.includes(file.type);
    if (!isImage && !isVideo) {
      toast.error("Use an image or video file");
      return;
    }

    setSending(true);
    const supabase = createClient();
    try {
      if (!(await gateSlaveMessage(supabase))) return;
      let upload = file;
      let mediaType: "image" | "video" = "image";
      if (isVideo) {
        mediaType = "video";
        const prepared = await prepareVideoForUpload(file);
        upload = prepared.file;
      } else {
        upload = await downsizeImageIfNeeded(file);
      }
      const ext = upload.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
      const path = await presignAndUpload({
        bucket: "messages",
        file: upload,
        contentType: upload.type || (isVideo ? "video/mp4" : "image/jpeg"),
        ext,
        relativePath: `${profile.id}/${Date.now()}.${ext}`,
      });
      const caption = draft.trim()
        ? formatRoleSpeech(draft.trim(), profile.role)
        : null;
      await sendDirectMessage(supabase, {
        conversationId,
        senderId: profile.id,
        content: caption,
        mediaPath: path,
        mediaType,
        replyToId: replyingTo?.id ?? null,
      });
      setDraft("");
      onCancelReply?.();
      await notifyRecipient(
        profile.role === "queen" ? "Media from Queen" : "Media from D",
        caption || (isVideo ? "Sent a video" : "Sent a photo"),
        `/dashboard/inbox/${conversationId}`
      );
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const startVoice = async () => {
    if (!profile || blocked) return;
    const mime = pickRecorderMimeType();
    if (!mime) {
      toast.error("Voice recording is not supported here");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void finishVoice(recorder.mimeType);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recordStartRef.current = Date.now();
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("Microphone permission denied");
    }
  };

  const stopVoice = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const finishVoice = async (mimeType: string) => {
    if (!profile) return;
    const raw = new Blob(chunksRef.current, { type: mimeType });
    if (!raw.size) return;
    setSending(true);
    const supabase = createClient();
    try {
      if (!(await gateSlaveMessage(supabase))) return;
      const blob = await normalizeVoiceBlob(raw);
      const durationMs = Date.now() - recordStartRef.current;
      const ext = blob.type.includes("wav")
        ? "wav"
        : blob.type.includes("mp4")
          ? "m4a"
          : "webm";
      const path = await presignAndUpload({
        bucket: "voice",
        file: blob,
        contentType: blob.type || "audio/wav",
        ext,
        relativePath: `${profile.id}/message/${Date.now()}.${ext}`,
      });
      await sendDirectMessage(supabase, {
        conversationId,
        senderId: profile.id,
        voicePath: path,
        voiceDurationMs: durationMs,
        replyToId: replyingTo?.id ?? null,
      });
      onCancelReply?.();
      await notifyRecipient(
        profile.role === "queen" ? "Voice from Queen" : "Voice from D",
        "Sent a voice note",
        `/dashboard/inbox/${conversationId}`
      );
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice send failed");
    } finally {
      setSending(false);
    }
  };

  const linkAttachment = async (
    type: MessageAttachmentType,
    id: string,
    summary: string
  ) => {
    if (!profile) return;
    const supabase = createClient();
    try {
      if (type === "tease") {
        await postTeaseToInboxes(supabase, {
          senderId: profile.id,
          teaseId: id,
          content: summary,
        });
      } else {
        await postToTopicThread(supabase, {
          topic: "general",
          senderId: profile.id,
          content: summary,
          attachmentType: type,
          attachmentId: id,
        });
      }
      setSheet(null);
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not link item");
    }
  };

  return (
    <div className={cn("space-y-2 border-t border-gold/10 pt-3", className)}>
      {blocked && (
        <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">
          Contact is restricted — messaging is blocked.
        </p>
      )}

      {replyingTo && (
        <div className="flex items-start gap-2 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2">
          <Reply className="mt-0.5 size-4 shrink-0 text-gold" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-gold">
              Replying to {replyingTo.sender?.username ?? "message"}
              {replyingTo.sender?.role === "queen" ? " · Queen" : ""}
            </p>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {messageSnippet(replyingTo)}
            </p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onCancelReply?.()}
            className="size-7 shrink-0 text-muted-foreground hover:text-ivory"
            aria-label="Cancel reply"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        disabled={blocked || sending}
        placeholder="Write a message…"
        className="border-gold/20 bg-void/60"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void sendText();
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={blocked || sending || !draft.trim()}
          onClick={() => void sendText()}
          className="bg-gold text-void hover:bg-gold-muted"
        >
          {sending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-2 h-3.5 w-3.5" />
          )}
          Send
        </Button>

        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={blocked || sending}
          onClick={() => fileRef.current?.click()}
          className="border-gold/30"
          aria-label="Attach media"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void sendMedia(f);
          }}
        />

        {!recording ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            disabled={blocked || sending}
            onClick={() => void startVoice()}
            className="border-gold/30"
            aria-label="Record voice"
          >
            <Mic className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon-sm"
            variant="destructive"
            onClick={stopVoice}
            aria-label="Stop recording"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        )}

        {isQueen && (
          <div className="relative">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={blocked || sending}
              onClick={() => setActionsOpen((o) => !o)}
              className="border-gold/30"
              aria-label="More actions"
            >
              {actionsOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
            {actionsOpen && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-48 rounded-lg border border-gold/20 bg-charcoal p-1 shadow-xl">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ivory hover:bg-gold/10"
                  onClick={() => {
                    setActionsOpen(false);
                    setSheet("tease");
                  }}
                >
                  <Sparkles className="h-4 w-4 text-gold" />
                  Send tease
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ivory hover:bg-gold/10"
                  onClick={() => {
                    setActionsOpen(false);
                    setSheet("task");
                  }}
                >
                  <ListTodo className="h-4 w-4 text-gold" />
                  Assign task
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ivory hover:bg-gold/10"
                  onClick={() => {
                    setActionsOpen(false);
                    setSheet("punishment");
                  }}
                >
                  <Ban className="h-4 w-4 text-gold" />
                  Issue punishment
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-gold/20 bg-charcoal sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-gold">
              {sheet === "tease"
                ? "Send tease"
                : sheet === "task"
                  ? "Assign task"
                  : "Issue punishment"}
            </DialogTitle>
          </DialogHeader>
          {sheet === "tease" && (
            <InboxTeaseForm
              recipientId={recipientId}
              onSuccess={(id, summary) =>
                void linkAttachment("tease", id, summary)
              }
            />
          )}
          {sheet === "task" && (
            <TaskForm
              assigneeId={recipientId}
              className="border-0 bg-transparent p-0"
              onSuccess={(id) => {
                if (id) void linkAttachment("task", id, "New task assigned");
              }}
            />
          )}
          {sheet === "punishment" && (
            <PunishmentForm
              recipientId={recipientId}
              className="border-0 bg-transparent p-0"
              onSuccess={(id) => {
                if (id)
                  void linkAttachment("punishment", id, "Punishment issued");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
