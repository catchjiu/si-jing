"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Ghost, ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import {
  MAX_VIDEO_BYTES,
  prepareVideoForUpload,
  VIDEO_TYPES,
  VIDEO_ACCEPT_EXTS,
  isAcceptedVideoUpload,
} from "@/lib/video-compress";
import { presignAndUpload, removeObject, signObjectUrl } from "@/lib/storage/client";
import { formatRoleSpeech } from "@/lib/role-speech";
import { notifyCreepThread } from "@/lib/inbox";
import { inboxAnchors } from "@/lib/inbox-deep-links";
import type { CreepEntryWithSignedUrl, CreepMediaKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CreepMedia } from "@/components/creep/creep-media";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, ...VIDEO_ACCEPT_EXTS];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

type Props = {
  galleryId: string;
  galleryTitle?: string | null;
  editingEntry?: CreepEntryWithSignedUrl | null;
  onCancelEdit?: () => void;
  onSuccess?: () => void;
  onUpdated?: (entry: CreepEntryWithSignedUrl) => void;
  className?: string;
};

export function CreepUploadForm({
  galleryId,
  galleryTitle,
  editingEntry = null,
  onCancelEdit,
  onSuccess,
  onUpdated,
  className,
}: Props) {
  const { profile, isSlave } = useAuth();
  const isEditing = !!editingEntry;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [previewMediaKind, setPreviewMediaKind] =
    useState<CreepMediaKind>("image");
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTitle(editingEntry?.title ?? "");
    setDescription(editingEntry?.description ?? "");
    setFile(null);
    setPreview(null);
    setPreviewMediaKind(editingEntry?.media_kind ?? "image");

    if (!editingEntry) {
      setExistingImageUrl(null);
      return;
    }
    if (editingEntry.signedUrl) {
      setExistingImageUrl(editingEntry.signedUrl);
      return;
    }
    void signObjectUrl({
      bucket: "creep",
      path: editingEntry.image_path,
    }).then((url) => {
      if (!cancelled) setExistingImageUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [editingEntry]);

  const setMediaFile = useCallback(
    (next: File | null) => {
      if (preview) URL.revokeObjectURL(preview);
      setFile(next);
      setPreview(next ? URL.createObjectURL(next) : null);
      setPreviewMediaKind(
        next && isAcceptedVideoUpload(next) ? "video" : "image"
      );
    },
    [preview]
  );

  const pickFile = (incoming: FileList | File[] | null) => {
    const candidate = incoming?.[0];
    if (!candidate) return;
    if (
      !IMAGE_TYPES.includes(candidate.type) &&
      !isAcceptedVideoUpload(candidate)
    ) {
      toast.error(
        "Use a JPG, PNG, WebP, GIF, MP4, HEVC, WebM, MOV, or OGG file"
      );
      return;
    }
    if (isAcceptedVideoUpload(candidate)) {
      if (candidate.size > MAX_VIDEO_BYTES) {
        toast.error("Video must be under 50MB");
        return;
      }
    } else if (candidate.size > MAX_IMAGE_SIZE) {
      toast.error("Image must be under 10MB");
      return;
    }
    setMediaFile(candidate);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSlave || !profile) {
      toast.error("Only D can upload to Creep galleries");
      return;
    }
    if (!isEditing && !file) {
      toast.error("Choose a photo or video");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    let imagePath = editingEntry?.image_path ?? "";
    let mediaKind: CreepMediaKind = editingEntry?.media_kind ?? "image";
    let signedUrl: string | undefined = existingImageUrl ?? undefined;

    try {
      if (file) {
        mediaKind = isAcceptedVideoUpload(file) ? "video" : "image";
        if (mediaKind === "video") {
          const prepared = await prepareVideoForUpload(file);
          if (prepared.compressed) {
            toast.message("Video compressed for upload");
          }
          const uploadFile = prepared.file;
          const ext = uploadFile.name.split(".").pop() || "mp4";
          const previousPath = imagePath;
          imagePath = await presignAndUpload({
            bucket: "creep",
            file: uploadFile,
            contentType: uploadFile.type || "video/mp4",
            ext,
            relativePath: `${profile.id}/${galleryId}/${Date.now()}.${ext}`,
          });
          signedUrl =
            (await signObjectUrl({ bucket: "creep", path: imagePath })) ??
            undefined;
          if (isEditing && previousPath && previousPath !== imagePath) {
            try {
              await removeObject({ bucket: "creep", path: previousPath });
            } catch {
              // best-effort
            }
          }
        } else {
          const uploadFile = await downsizeImageIfNeeded(file);
          if (uploadFile.size < file.size) {
            toast.message(
              `Image compressed to ${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`
            );
          }
          const ext = uploadFile.name.split(".").pop() || "jpg";
          const previousPath = imagePath;
          imagePath = await presignAndUpload({
            bucket: "creep",
            file: uploadFile,
            contentType: uploadFile.type || "image/jpeg",
            ext,
            relativePath: `${profile.id}/${galleryId}/${Date.now()}.${ext}`,
          });
          signedUrl =
            (await signObjectUrl({ bucket: "creep", path: imagePath })) ??
            undefined;
          if (isEditing && previousPath && previousPath !== imagePath) {
            try {
              await removeObject({ bucket: "creep", path: previousPath });
            } catch {
              // best-effort
            }
          }
        }
      }

      if (!imagePath) throw new Error("Media is required");

      const payload = {
        title: title.trim()
          ? formatRoleSpeech(title.trim(), "slave")
          : null,
        description: description.trim()
          ? formatRoleSpeech(description.trim(), "slave")
          : null,
        image_path: imagePath,
        media_kind: mediaKind,
      };

      if (isEditing && editingEntry) {
        const { data, error } = await supabase
          .from("creep_entries")
          .update(payload)
          .eq("id", editingEntry.id)
          .select("*")
          .single();
        if (error) throw error;
        toast.success("Updated");
        onUpdated?.({
          ...(data as CreepEntryWithSignedUrl),
          media_kind: mediaKind,
          signedUrl: signedUrl ?? existingImageUrl ?? undefined,
        });
        onCancelEdit?.();
      } else {
        const { data: inserted, error } = await supabase
          .from("creep_entries")
          .insert({
            created_by: profile.id,
            gallery_id: galleryId,
            ...payload,
          })
          .select("id")
          .single();
        if (error) throw error;
        toast.success("Added to gallery");
        void notifyCreepThread(supabase, {
          senderId: profile.id,
          content:
            title.trim() ||
            description.trim().slice(0, 120) ||
            `New upload in ${galleryTitle ?? "Creep"}`,
          galleryId,
          attachmentAnchor: inserted?.id
            ? inboxAnchors.creepEntry(inserted.id as string)
            : inboxAnchors.creepGallery(),
          pushTitle: `New ${galleryTitle ?? "Creep"} upload`,
          pushBody:
            title.trim() ||
            description.trim().slice(0, 80) ||
            galleryTitle ||
            "D added a photo",
          notifyTarget: "queen",
        });
        setTitle("");
        setDescription("");
        setMediaFile(null);
        setPreviewMediaKind("image");
        onSuccess?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSlave) return null;

  const displayPreview = preview || existingImageUrl;

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "space-y-5 rounded-xl border border-gold/20 bg-charcoal/80 p-6",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-royal/30">
            <Ghost className="h-5 w-5 text-gold" />
          </div>
          <div>
            <h3 className="font-heading text-xl text-ivory">
              {isEditing ? "Edit upload" : "Add photo or video"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEditing
                ? "Replace the media or update the caption"
                : galleryTitle
                  ? `Add to “${galleryTitle}”`
                  : "Upload a photo or video"}
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
        <Label htmlFor="creep-title">Title (optional)</Label>
        <Input
          id="creep-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional caption"
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="creep-description">Note (optional)</Label>
        <Textarea
          id="creep-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Anything Queen should know…"
          rows={3}
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label>{isEditing ? "Media (optional replace)" : "Photo or video"}</Label>
        {displayPreview ? (
          <div className="relative overflow-hidden rounded-lg border border-gold/20 bg-void">
            <CreepMedia
              signedUrl={displayPreview}
              alt="Preview"
              mediaKind={previewMediaKind}
              mediaPath={editingEntry?.image_path ?? null}
              variant="preview"
            />
            <div className="absolute right-2 top-2 flex gap-2">
              {file && (
                <button
                  type="button"
                  onClick={() => {
                    setMediaFile(null);
                    setPreviewMediaKind(editingEntry?.media_kind ?? "image");
                  }}
                  className="rounded-full bg-void/80 p-1.5 text-ivory hover:text-gold"
                  aria-label="Remove selected media"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <label className="cursor-pointer rounded-full bg-void/80 px-2.5 py-1.5 text-xs text-ivory hover:text-gold">
                Replace
                <input
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files)}
                />
              </label>
            </div>
          </div>
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              pickFile(e.dataTransfer.files);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 transition-colors",
              dragActive
                ? "border-gold bg-gold/10"
                : "border-gold/25 bg-void/40 hover:border-gold/50"
            )}
          >
            <ImagePlus className="h-8 w-8 text-gold/70" />
            <span className="text-sm text-muted-foreground">
              Drop a photo or video, or click to choose
            </span>
            <input
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="sr-only"
              onChange={(e) => pickFile(e.target.files)}
            />
          </label>
        )}
      </div>

      <Button
        type="submit"
        disabled={submitting || (!isEditing && !file)}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isEditing ? "Saving…" : "Uploading…"}
          </>
        ) : (
          <>
            <Ghost className="mr-2 h-4 w-4" />
            {isEditing ? "Save" : "Add to gallery"}
          </>
        )}
      </Button>
    </form>
  );
}
