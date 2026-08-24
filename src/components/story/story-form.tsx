"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookMarked, Loader2, Save, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Story, StoryStatus } from "@/lib/types";
import {
  appendTrailingTbc,
  continuationFingerprint,
  nextStoryTimingFields,
  parseStoryViewWindow,
  STORY_VIEW_WINDOW_OPTIONS,
  storyHasTbc,
  storyViewWindowSelectValue,
} from "@/lib/story-access";
import {
  sanitizeStoryHtml,
  storyHtmlHasText,
  storyHtmlExcerpt,
} from "@/lib/sanitize-html";
import { formatRoleSpeech, formatRoleSpeechHtml } from "@/lib/role-speech";
import { storyPageHref } from "@/lib/inbox-deep-links";
import { notifyPush } from "@/lib/push-client";
import { postToTopicThread } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StoryRichTextEditor } from "@/components/story/story-rich-text-editor";
import { StoryRewritePanel } from "@/components/story/story-rewrite-panel";
import { StoryGeneratePanel } from "@/components/story/story-generate-panel";
import { StoryExtendDialog } from "@/components/story/story-extend-dialog";

type StoryFormProps = {
  story?: Story | null;
  onSuccess?: (storyId: string) => void;
  onCancel?: () => void;
  className?: string;
  /** Open with the write-from-prompt panel focused. */
  promptFirst?: boolean;
  /** Append a To be continued break at the end when opening the editor. */
  startWithTbc?: boolean;
};

export function StoryForm({
  story,
  onSuccess,
  onCancel,
  className,
  promptFirst = false,
  startWithTbc = false,
}: StoryFormProps) {
  const { profile, isQueen, isSlave } = useAuth();
  const [title, setTitle] = useState(story?.title ?? "");
  const [body, setBody] = useState(() =>
    startWithTbc ? appendTrailingTbc(story?.body ?? "") : (story?.body ?? "")
  );
  const [status, setStatus] = useState<StoryStatus>(story?.status ?? "published");
  const [viewWindow, setViewWindow] = useState(
    storyViewWindowSelectValue(story?.view_window_minutes)
  );
  const [submitting, setSubmitting] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);

  const isEdit = Boolean(story?.id);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const trimmedTitle = formatRoleSpeech(title.trim(), profile.role);
    const cleanBody = formatRoleSpeechHtml(
      sanitizeStoryHtml(body),
      profile.role
    );

    if (!trimmedTitle) {
      toast.error("Add a title");
      return;
    }
    if (!storyHtmlHasText(cleanBody)) {
      toast.error("Write some story text");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const timing = nextStoryTimingFields({
      previous: story ?? null,
      nextStatus: status,
      nextWindowMinutes: parseStoryViewWindow(viewWindow),
      now,
    });

    try {
      if (isEdit && story) {
        const { error } = await supabase
          .from("stories")
          .update({
            title: trimmedTitle,
            body: cleanBody,
            status,
            view_window_minutes: timing.view_window_minutes,
            viewable_until: timing.viewable_until,
            published_at: timing.published_at,
            tbc_locked: storyHasTbc(cleanBody),
            updated_at: nowIso,
          })
          .eq("id", story.id)
          .eq("author_id", profile.id);

        if (error) throw error;

        const tbcLocked = storyHasTbc(cleanBody);
        const continuationChanged =
          continuationFingerprint(story.body) !==
          continuationFingerprint(cleanBody);
        const tbcRelock =
          status === "published" &&
          tbcLocked &&
          (continuationChanged || !story.tbc_locked);
        const windowRestarted =
          story.status !== "published" ||
          (story.view_window_minutes ?? null) !== timing.view_window_minutes;
        if (tbcRelock || (status === "published" && windowRestarted)) {
          await supabase
            .from("story_access_grants")
            .delete()
            .eq("story_id", story.id);
          await supabase
            .from("story_access_requests")
            .delete()
            .eq("story_id", story.id);
        }

        toast.success(
          tbcRelock
            ? "To be continued — they need to request access again"
            : "Story updated"
        );
        if (tbcRelock) {
          void notifyPush({
            title: "To be continued",
            body: `${trimmedTitle} — request access to keep reading`,
            url: storyPageHref(story.id),
            kind: "story",
          });
          void postToTopicThread(supabase, {
            topic: "general",
            senderId: profile.id,
            content: `To be continued: ${trimmedTitle}`,
            attachmentType: "story",
            attachmentId: story.id,
          });
        } else if (status === "published" && story.status === "draft") {
          void notifyPush({
            title: isQueen ? "Queen published a story" : "New story published",
            body: trimmedTitle,
            url: storyPageHref(story.id),
            target: isQueen ? "slave" : "queen",
            kind: "story",
          });
          void postToTopicThread(supabase, {
            topic: "general",
            senderId: profile.id,
            content: `Published story: ${trimmedTitle}`,
            attachmentType: "story",
            attachmentId: story.id,
          });
        }
        onSuccess?.(story.id);
        return;
      }

      const { data, error } = await supabase
        .from("stories")
        .insert({
          author_id: profile.id,
          title: trimmedTitle,
          body: cleanBody,
          status,
          view_window_minutes: timing.view_window_minutes,
          viewable_until: timing.viewable_until,
          published_at: timing.published_at,
          tbc_locked: storyHasTbc(cleanBody),
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (error) throw error;
      const storyId = data.id as string;

      toast.success(status === "draft" ? "Draft saved" : "Story published");
      if (status === "published") {
        void notifyPush({
          title: isQueen ? "Queen shared a story" : "New story shared",
          body: trimmedTitle || storyHtmlExcerpt(cleanBody),
          url: storyPageHref(storyId),
          target: isQueen ? "slave" : "queen",
          kind: "story",
        });
        void postToTopicThread(supabase, {
          topic: "general",
          senderId: profile.id,
          content: `Shared a story: ${trimmedTitle}`,
          attachmentType: "story",
          attachmentId: storyId,
        });
      }
      setTitle("");
      setBody("");
      setStatus("published");
      setViewWindow("none");
      onSuccess?.(storyId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save story");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isQueen && !isSlave) return null;

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-5 sm:p-6",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <BookMarked className="h-6 w-6 text-gold" />
        <div>
          <h3 className="font-heading text-xl text-ivory">
            {isEdit
              ? "Edit story"
              : isSlave && promptFirst
                ? "Write from a prompt"
                : "New story"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isEdit
              ? "Edit your story — Queen/slave speech formatting applies on save"
              : isSlave
                ? "Prompt a whole draft, or write it yourself. Role speech formatting applies on save."
                : "Write it yourself. Role speech formatting applies on save."}
          </p>
        </div>
      </div>

      {!isEdit && isSlave && (
        <StoryGeneratePanel
          titleHint={title}
          disabled={submitting}
          autoFocus={promptFirst}
          onGenerated={({ title: nextTitle, html }) => {
            setTitle((current) => current.trim() || nextTitle);
            setBody(html);
          }}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="story-title">Title</Label>
        <Input
          id="story-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give it a title…"
          className="border-gold/20 bg-void/60"
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label>Story</Label>
        <StoryRichTextEditor
          value={body}
          onChange={setBody}
          editable={!submitting}
          placeholder="Begin the story…"
        />
        <p className="text-[11px] text-muted-foreground">
          Use <span className="text-gold">TBC</span> in the toolbar to drop a To
          be continued break. They can read everything above it; what follows
          stays locked until they request access again.
        </p>
      </div>

      {isSlave && (
        <StoryRewritePanel
          html={body}
          disabled={submitting}
          onApply={setBody}
        />
      )}

      {storyHtmlHasText(body) && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitting}
          className="border-gold/25"
          onClick={() => setExtendOpen(true)}
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          Extend story…
        </Button>
      )}

      <StoryExtendDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        title={title.trim() || "Untitled"}
        html={body}
        persist={false}
        onApplied={setBody}
      />

      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as StoryStatus)}
          disabled={submitting}
        >
          <SelectTrigger className="w-full border-gold/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="published">Published (both can see)</SelectItem>
            <SelectItem value="draft">Draft (only you)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Reading window</Label>
        <Select
          value={viewWindow}
          onValueChange={setViewWindow}
          disabled={submitting}
        >
          <SelectTrigger className="w-full border-gold/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STORY_VIEW_WINDOW_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          {status === "draft"
            ? "The timer starts when you publish. After it ends they will see the cover with blurred text and can request access."
            : "After the window closes, the other person sees the artwork with blurred text and a request-access button. You always keep the full story."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={submitting}
          className="bg-gold text-void hover:bg-gold-muted"
        >
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {isEdit
            ? "Save changes"
            : status === "draft"
              ? "Save draft"
              : "Publish story"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="border-gold/25"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
