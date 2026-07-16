"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, FolderPlus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleSpeech } from "@/lib/role-speech";
import { notifyWorshipThread } from "@/lib/inbox";
import { inboxAnchors } from "@/lib/inbox-deep-links";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { WorshipGalleryTopic } from "@/lib/types";

interface WorshipTopicFormProps {
  editingGallery?: WorshipGalleryTopic | null;
  onCancelEdit?: () => void;
  onSuccess?: (gallery: WorshipGalleryTopic) => void;
  onUpdated?: (gallery: WorshipGalleryTopic) => void;
  className?: string;
}

export function WorshipTopicForm({
  editingGallery = null,
  onCancelEdit,
  onSuccess,
  onUpdated,
  className,
}: WorshipTopicFormProps) {
  const { profile, isSlave } = useAuth();
  const isEditing = !!editingGallery;
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTopic(editingGallery?.topic ?? "");
    setDescription(editingGallery?.description ?? "");
  }, [editingGallery]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSlave || !profile) {
      toast.error("Only D can create worship galleries");
      return;
    }
    if (!topic.trim()) {
      toast.error("Give the gallery a topic");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    try {
      const payload = {
        topic: formatRoleSpeech(topic.trim(), "slave"),
        description: description.trim()
          ? formatRoleSpeech(description.trim(), "slave")
          : null,
      };

      if (isEditing && editingGallery) {
        const { data, error } = await supabase
          .from("worship_galleries")
          .update(payload)
          .eq("id", editingGallery.id)
          .select("*")
          .single();

        if (error) throw error;

        toast.success("Gallery updated");
        onUpdated?.(data as WorshipGalleryTopic);
        onCancelEdit?.();
      } else {
        const { data, error } = await supabase
          .from("worship_galleries")
          .insert({
            created_by: profile.id,
            ...payload,
          })
          .select("*")
          .single();

        if (error) throw error;

        toast.success("Gallery created");
        const gallery = data as WorshipGalleryTopic;
        void notifyWorshipThread(supabase, {
          senderId: profile.id,
          content: `New gallery: ${topic.trim()}`,
          galleryId: gallery.id,
          attachmentAnchor: inboxAnchors.worshipGallery(),
          pushTitle: "New worship gallery",
          pushBody: topic.trim(),
          notifyTarget: "queen",
        });
        setTopic("");
        setDescription("");
        onSuccess?.(data as WorshipGalleryTopic);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not save gallery";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSlave) return null;

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-6",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-royal/30">
            <FolderPlus className="h-5 w-5 text-gold" />
          </div>
          <div>
            <h3 className="font-heading text-xl text-ivory">
              {isEditing ? "Edit gallery" : "New gallery"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEditing
                ? "Update the topic or description"
                : "Create a themed collection — e.g. Her smile, Her power, Date nights"}
            </p>
          </div>
        </div>
        {isEditing && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancelEdit}
            className="text-muted-foreground hover:text-ivory"
          >
            Cancel
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="worship-topic">Topic</Label>
        <Input
          id="worship-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Her smile, Her elegance, Memories…"
          className="border-gold/20 bg-void/60"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="worship-gallery-description">Description (optional)</Label>
        <Textarea
          id="worship-gallery-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this collection is about…"
          rows={3}
          className="border-gold/20 bg-void/60"
        />
      </div>

      <Button
        type="submit"
        disabled={submitting || !topic.trim()}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isEditing ? "Saving…" : "Creating…"}
          </>
        ) : (
          <>
            <Crown className="mr-2 h-4 w-4" />
            {isEditing ? "Save gallery" : "Create gallery"}
          </>
        )}
      </Button>
    </form>
  );
}
