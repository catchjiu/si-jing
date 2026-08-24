"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderPlus, Ghost, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleSpeech } from "@/lib/role-speech";
import { uniqueCreepSlug } from "@/lib/creep";
import { notifyCreepThread } from "@/lib/inbox";
import { inboxAnchors } from "@/lib/inbox-deep-links";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { CreepGallery } from "@/lib/types";

type Props = {
  editingGallery?: CreepGallery | null;
  existingSlugs?: string[];
  onCancelEdit?: () => void;
  onSuccess?: (gallery: CreepGallery) => void;
  onUpdated?: (gallery: CreepGallery) => void;
  className?: string;
};

export function CreepTopicForm({
  editingGallery = null,
  existingSlugs = [],
  onCancelEdit,
  onSuccess,
  onUpdated,
  className,
}: Props) {
  const { profile, isSlave } = useAuth();
  const isEditing = !!editingGallery;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTitle(editingGallery?.title ?? "");
    setDescription(editingGallery?.description ?? "");
  }, [editingGallery]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSlave || !profile) {
      toast.error("Only D can create Creep galleries");
      return;
    }
    if (!title.trim()) {
      toast.error("Give the gallery a name");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    try {
      if (isEditing && editingGallery) {
        const { data, error } = await supabase
          .from("creep_galleries")
          .update({
            title: formatRoleSpeech(title.trim(), "slave"),
            description: description.trim()
              ? formatRoleSpeech(description.trim(), "slave")
              : null,
          })
          .eq("id", editingGallery.id)
          .select("*")
          .single();
        if (error) throw error;
        toast.success("Gallery updated");
        onUpdated?.(data as CreepGallery);
        onCancelEdit?.();
      } else {
        const slug = uniqueCreepSlug(title, existingSlugs);
        const { data, error } = await supabase
          .from("creep_galleries")
          .insert({
            created_by: profile.id,
            title: formatRoleSpeech(title.trim(), "slave"),
            slug,
            description: description.trim()
              ? formatRoleSpeech(description.trim(), "slave")
              : null,
            is_system: false,
            sort_order: 100 + existingSlugs.length,
          })
          .select("*")
          .single();
        if (error) throw error;
        toast.success("Gallery added to Creep");
        const gallery = data as CreepGallery;
        void notifyCreepThread(supabase, {
          senderId: profile.id,
          content: `New Creep gallery: ${title.trim()}`,
          galleryId: gallery.id,
          attachmentAnchor: inboxAnchors.creepGallery(),
          pushTitle: "New Creep gallery",
          pushBody: title.trim(),
          notifyTarget: "queen",
        });
        setTitle("");
        setDescription("");
        onSuccess?.(gallery);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save gallery");
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
              {isEditing ? "Edit gallery" : "Add a gallery"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEditing
                ? "Update the name or description"
                : "It will appear in the Creep menu for both of you"}
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
        <Label htmlFor="creep-gallery-title">Name</Label>
        <Input
          id="creep-gallery-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Socks, Armpits, Bruises…"
          className="border-gold/20 bg-void/60"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="creep-gallery-description">Description (optional)</Label>
        <Textarea
          id="creep-gallery-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What belongs in this collection…"
          rows={3}
          className="border-gold/20 bg-void/60"
        />
      </div>

      <Button
        type="submit"
        disabled={submitting || !title.trim()}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isEditing ? "Saving…" : "Adding…"}
          </>
        ) : (
          <>
            <Ghost className="mr-2 h-4 w-4" />
            {isEditing ? "Save gallery" : "Add to Creep"}
          </>
        )}
      </Button>
    </form>
  );
}
