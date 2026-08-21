"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookMarked, Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Story, StoryStatus } from "@/lib/types";
import {
  sanitizeStoryHtml,
  storyHtmlHasText,
  storyHtmlExcerpt,
} from "@/lib/sanitize-html";
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

type StoryFormProps = {
  story?: Story | null;
  onSuccess?: (storyId: string) => void;
  onCancel?: () => void;
  className?: string;
};

export function StoryForm({
  story,
  onSuccess,
  onCancel,
  className,
}: StoryFormProps) {
  const { profile, isQueen, isSlave } = useAuth();
  const [title, setTitle] = useState(story?.title ?? "");
  const [body, setBody] = useState(story?.body ?? "");
  const [status, setStatus] = useState<StoryStatus>(story?.status ?? "published");
  const [submitting, setSubmitting] = useState(false);

  const isEdit = Boolean(story?.id);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const trimmedTitle = title.trim();
    const cleanBody = sanitizeStoryHtml(body);

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
    const now = new Date().toISOString();

    try {
      if (isEdit && story) {
        const { error } = await supabase
          .from("stories")
          .update({
            title: trimmedTitle,
            body: cleanBody,
            status,
            updated_at: now,
          })
          .eq("id", story.id)
          .eq("author_id", profile.id);

        if (error) throw error;

        toast.success("Story updated");
        if (status === "published" && story.status === "draft") {
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
          updated_at: now,
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
            {isEdit ? "Edit story" : "New story"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isEdit
              ? "Edit your story — only the author can change it"
              : "Rich text draft — publish when ready for the other to read"}
          </p>
        </div>
      </div>

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
      </div>

      {isSlave && (
        <StoryRewritePanel
          html={body}
          disabled={submitting}
          onApply={setBody}
        />
      )}

      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as StoryStatus)}
          disabled={submitting}
        >
          <SelectTrigger className="border-gold/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="published">Published (both can see)</SelectItem>
            <SelectItem value="draft">Draft (only you)</SelectItem>
          </SelectContent>
        </Select>
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
