"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import {
  MAX_VIDEO_BYTES,
  prepareVideoForUpload,
  VIDEO_TYPES,
} from "@/lib/video-compress";
import { resolveImageLocation } from "@/lib/location";
import { presignAndUpload, removeObject } from "@/lib/storage/client";
import { formatRoleSpeech } from "@/lib/role-speech";
import { notifyWorshipThread } from "@/lib/inbox";
import { inboxAnchors } from "@/lib/inbox-deep-links";
import type { QueenPictureSource } from "@/lib/queen-picture-sources";
import {
  isOwnedWorshipUpload,
  signWorshipEntryUrl,
} from "@/lib/worship-storage";
import { loveColor, loveLabel } from "@/lib/worship";
import { QueenPicturesPicker } from "@/components/worship/queen-pictures-picker";
import { WorshipMedia } from "@/components/worship/worship-media";
import type { WorshipMediaKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { WorshipEntryWithSignedUrl } from "@/lib/types";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function isVideoType(type: string): boolean {
  return VIDEO_TYPES.includes(type as (typeof VIDEO_TYPES)[number]);
}

type PhotoMode = "upload" | "queen";

interface WorshipFormProps {
  galleryId: string;
  galleryTopic?: string | null;
  editingEntry?: WorshipEntryWithSignedUrl | null;
  onCancelEdit?: () => void;
  onSuccess?: () => void;
  onUpdated?: (entry: WorshipEntryWithSignedUrl) => void;
  className?: string;
}

export function WorshipForm({
  galleryId,
  galleryTopic,
  editingEntry = null,
  onCancelEdit,
  onSuccess,
  onUpdated,
  className,
}: WorshipFormProps) {
  const { profile, isSlave } = useAuth();
  const isEditing = !!editingEntry;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loveLevel, setLoveLevel] = useState(50);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoMode, setPhotoMode] = useState<PhotoMode>("upload");
  const [selectedQueenPicture, setSelectedQueenPicture] =
    useState<QueenPictureSource | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [previewMediaKind, setPreviewMediaKind] =
    useState<WorshipMediaKind>("image");
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const label = loveLabel(loveLevel);

  useEffect(() => {
    let cancelled = false;
    setTitle(editingEntry?.title ?? "");
    setDescription(editingEntry?.description ?? "");
    setLoveLevel(editingEntry?.love_level ?? 50);
    setFile(null);
    setPreview(null);
    setSelectedQueenPicture(null);
    setPhotoMode("upload");
    setPreviewMediaKind(editingEntry?.media_kind ?? "image");

    if (!editingEntry) {
      setExistingImageUrl(null);
      return;
    }

    if (editingEntry.signedUrl) {
      setExistingImageUrl(editingEntry.signedUrl);
      return;
    }

    void signWorshipEntryUrl(editingEntry).then((url) => {
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
        next && isVideoType(next.type) ? "video" : "image"
      );
    },
    [preview]
  );

  const pickFile = (incoming: FileList | File[] | null) => {
    const candidate = incoming?.[0];
    if (!candidate) return;
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      toast.error("Use a JPG, PNG, WebP, GIF, MP4, WebM, or MOV file");
      return;
    }
    if (isVideoType(candidate.type)) {
      if (candidate.size > MAX_VIDEO_BYTES) {
        toast.error("Video must be under 50MB");
        return;
      }
    } else if (candidate.size > MAX_IMAGE_SIZE) {
      toast.error("Image must be under 10MB");
      return;
    }
    setMediaFile(candidate);
    setSelectedQueenPicture(null);
    setPhotoMode("upload");
  };

  const onSelectQueenPicture = (source: QueenPictureSource | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setSelectedQueenPicture(source);
    setPreviewMediaKind(source?.mediaKind ?? "image");
    if (source) setPhotoMode("queen");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSlave || !profile) {
      toast.error("Only D can add worship");
      return;
    }
    if (!isEditing && !file && !selectedQueenPicture) {
      toast.error("Attach a photo or video of Queen, or pick one from her gifts");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    try {
      let imagePath = editingEntry?.image_path ?? null;
      let storageBucket = editingEntry?.storage_bucket ?? "worship";
      let sourceType = editingEntry?.source_type ?? null;
      let sourceId = editingEntry?.source_id ?? null;
      let latitude = editingEntry?.latitude ?? null;
      let longitude = editingEntry?.longitude ?? null;
      let accuracy_m = editingEntry?.accuracy_m ?? null;
      let location_source = editingEntry?.location_source ?? null;
      let mediaKind: WorshipMediaKind =
        editingEntry?.media_kind ?? "image";

      let signedUrl = editingEntry?.signedUrl;

      if (selectedQueenPicture && !file) {
        imagePath = selectedQueenPicture.imagePath;
        storageBucket = selectedQueenPicture.storageBucket;
        sourceType = selectedQueenPicture.sourceType;
        sourceId = selectedQueenPicture.sourceId;
        latitude = selectedQueenPicture.latitude;
        longitude = selectedQueenPicture.longitude;
        accuracy_m = selectedQueenPicture.accuracy_m;
        location_source = selectedQueenPicture.location_source;
        mediaKind = selectedQueenPicture.mediaKind;
        signedUrl = selectedQueenPicture.signedUrl;
      } else if (file) {
        const isVideo = isVideoType(file.type);
        mediaKind = isVideo ? "video" : "image";

        if (isVideo) {
          const prepared = await prepareVideoForUpload(file);
          if (prepared.compressed) {
            toast.message("Video compressed for upload");
          }
          const uploadFile = prepared.file;
          const ext = uploadFile.name.split(".").pop() || "mp4";
          const previousPath = imagePath;
          imagePath = await presignAndUpload({
            bucket: "worship",
            file: uploadFile,
            contentType: uploadFile.type || "video/mp4",
            ext,
            relativePath: `${profile.id}/${Date.now()}.${ext}`,
          });
          storageBucket = "worship";
          sourceType = "upload";
          sourceId = null;
          latitude = null;
          longitude = null;
          accuracy_m = null;
          location_source = null;
          signedUrl =
            (await signWorshipEntryUrl({
              image_path: imagePath,
              storage_bucket: storageBucket,
            })) ?? undefined;

          if (
            isEditing &&
            previousPath &&
            previousPath !== imagePath &&
            editingEntry &&
            isOwnedWorshipUpload(editingEntry)
          ) {
            try {
              await removeObject({ bucket: "worship", path: previousPath });
            } catch {
              // Best-effort cleanup of replaced media
            }
          }
        } else {
          const geo = await resolveImageLocation(file);
          if (geo) {
            toast.message(
              geo.source === "exif"
                ? "Photo location from image metadata"
                : "Photo location from device GPS"
            );
          }
          const uploadFile = await downsizeImageIfNeeded(file);
          if (uploadFile.size < file.size) {
            toast.message(
              `Image compressed to ${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`
            );
          }
          const ext = uploadFile.name.split(".").pop() || "jpg";
          const previousPath = imagePath;
          imagePath = await presignAndUpload({
            bucket: "worship",
            file: uploadFile,
            contentType: uploadFile.type || "image/jpeg",
            ext,
            relativePath: `${profile.id}/${Date.now()}.${ext}`,
          });
          storageBucket = "worship";
          sourceType = "upload";
          sourceId = null;
          latitude = geo?.latitude ?? null;
          longitude = geo?.longitude ?? null;
          accuracy_m = geo?.accuracy_m ?? null;
          location_source = geo?.source ?? null;
          signedUrl =
            (await signWorshipEntryUrl({
              image_path: imagePath,
              storage_bucket: storageBucket,
            })) ?? undefined;

          if (
            isEditing &&
            previousPath &&
            previousPath !== imagePath &&
            editingEntry &&
            isOwnedWorshipUpload(editingEntry)
          ) {
            try {
              await removeObject({ bucket: "worship", path: previousPath });
            } catch {
              // Best-effort cleanup of replaced image
            }
          }
        }
      }

      if (!imagePath) {
        throw new Error("Media is required");
      }

      const resolvedTitle =
        title.trim() ||
        (selectedQueenPicture?.label && !file
          ? selectedQueenPicture.label
          : "");

      const payload = {
        title: resolvedTitle
          ? formatRoleSpeech(resolvedTitle, "slave")
          : null,
        description: description.trim()
          ? formatRoleSpeech(description.trim(), "slave")
          : null,
        image_path: imagePath,
        media_kind: mediaKind,
        storage_bucket: storageBucket,
        source_type: sourceType,
        source_id: sourceId,
        love_level: loveLevel,
        latitude,
        longitude,
        accuracy_m,
        location_source,
      };

      if (isEditing && editingEntry) {
        const { data, error } = await supabase
          .from("worship_entries")
          .update(payload)
          .eq("id", editingEntry.id)
          .select("*")
          .single();

        if (error) throw error;

        toast.success("Worship updated");
        onUpdated?.({
          ...(data as WorshipEntryWithSignedUrl),
          media_kind: mediaKind,
          signedUrl: signedUrl ?? existingImageUrl ?? undefined,
        });
        onCancelEdit?.();
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("worship_entries")
          .insert({
            created_by: profile.id,
            gallery_id: galleryId,
            ...payload,
          })
          .select("id")
          .single();

        if (insertError) {
          if (insertError.code === "23505") {
            toast.error("That item is already in this gallery");
            return;
          }
          throw insertError;
        }

        toast.success("Added to gallery");
        void notifyWorshipThread(supabase, {
          senderId: profile.id,
          content:
            title.trim() ||
            description.trim().slice(0, 120) ||
            `New worship in ${galleryTopic ?? "gallery"}`,
          galleryId,
          attachmentAnchor: inserted?.id
            ? inboxAnchors.worshipEntry(inserted.id)
            : null,
          pushTitle: "New worship",
          pushBody:
            title.trim() ||
            description.trim().slice(0, 80) ||
            galleryTopic ||
            "D added worship of you",
          notifyTarget: "queen",
        });
        setTitle("");
        setDescription("");
        setLoveLevel(50);
        setMediaFile(null);
        setSelectedQueenPicture(null);
        setPhotoMode("upload");
        setPreviewMediaKind("image");
        onSuccess?.();
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not save worship";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSlave) return null;

  const displayPreview =
    preview ||
    existingImageUrl ||
    (photoMode === "queen" ? selectedQueenPicture?.signedUrl : null);

  const activePreviewKind: WorshipMediaKind =
    preview || file
      ? previewMediaKind
      : photoMode === "queen"
        ? (selectedQueenPicture?.mediaKind ?? "image")
        : editingEntry?.media_kind ?? "image";

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
            <Crown className="h-5 w-5 text-gold" />
          </div>
          <div>
            <h3 className="font-heading text-xl text-ivory">
              {isEditing ? "Edit offering" : "Add photo or video"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEditing
                ? "Update the media, description, or love rating"
                : galleryTopic
                  ? `Add to “${galleryTopic}”`
                  : "Upload a photo or video of Queen for this gallery"}
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
        <Label htmlFor="worship-title">Title (optional)</Label>
        <Input
          id="worship-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Her grace, her power, her smile…"
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="worship-description">Description</Label>
        <Textarea
          id="worship-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this image means to you, why you worship her…"
          rows={4}
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-4 rounded-lg border border-gold/15 bg-void/50 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Label className="text-ivory/80">How much do you love her?</Label>
            <p className={cn("mt-1 font-heading text-2xl", loveColor(loveLevel))}>
              {label}
            </p>
          </div>
          <p className="font-heading text-3xl tabular-nums text-gold">
            {loveLevel}
            <span className="text-sm text-muted-foreground">/100</span>
          </p>
        </div>

        <Slider
          value={[loveLevel]}
          onValueChange={(v) => setLoveLevel(v[0] ?? 50)}
          min={1}
          max={100}
          step={1}
          aria-label="Love level"
          className="py-2 **:data-[slot=slider-range]:bg-gold **:data-[slot=slider-thumb]:border-gold **:data-[slot=slider-thumb]:bg-gold"
        />

        <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Quiet</span>
          <span>Devoted</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPhotoMode("upload");
              setSelectedQueenPicture(null);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors",
              photoMode === "upload"
                ? "border-gold bg-gold/15 text-gold"
                : "border-gold/20 text-muted-foreground hover:text-ivory"
            )}
          >
            Upload new
          </button>
          {!isEditing && (
            <button
              type="button"
              onClick={() => {
                setPhotoMode("queen");
                if (preview) {
                  URL.revokeObjectURL(preview);
                  setFile(null);
                  setPreview(null);
                }
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors",
                photoMode === "queen"
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-gold/20 text-muted-foreground hover:text-ivory"
              )}
            >
              From Queen&apos;s media
            </button>
          )}
        </div>

        <Label>
          {isEditing ? "Media (optional replace)" : "Photo or video of Queen"}
        </Label>

        {!isEditing && photoMode === "queen" ? (
          <div className="space-y-3">
            <QueenPicturesPicker
              galleryId={galleryId}
              selected={selectedQueenPicture}
              onSelect={onSelectQueenPicture}
            />
            {selectedQueenPicture?.signedUrl && (
              <div className="relative overflow-hidden rounded-lg border border-gold/20 bg-void">
                <WorshipMedia
                  signedUrl={selectedQueenPicture.signedUrl}
                  alt={selectedQueenPicture.label}
                  mediaKind={selectedQueenPicture.mediaKind}
                  mediaPath={selectedQueenPicture.imagePath}
                  variant="preview"
                  fill={false}
                />
              </div>
            )}
          </div>
        ) : displayPreview ? (
          <div className="relative overflow-hidden rounded-lg border border-gold/20 bg-void">
            <WorshipMedia
              signedUrl={displayPreview}
              alt="Worship preview"
              mediaKind={activePreviewKind}
              mediaPath={
                editingEntry?.image_path ??
                selectedQueenPicture?.imagePath ??
                null
              }
              variant="preview"
              fill={false}
            />
            <div className="absolute right-2 top-2 flex gap-2">
              {(file || selectedQueenPicture) && (
                <button
                  type="button"
                  onClick={() => {
                    setMediaFile(null);
                    setSelectedQueenPicture(null);
                    setPreviewMediaKind("image");
                  }}
                  className="rounded-full bg-void/80 p-1.5 text-ivory hover:text-gold"
                  aria-label="Remove selected media"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {photoMode === "upload" && (
                <label className="cursor-pointer rounded-full bg-void/80 px-2.5 py-1.5 text-xs text-ivory hover:text-gold">
                  Replace
                  <input
                    type="file"
                    accept={ACCEPTED_TYPES.join(",")}
                    className="sr-only"
                    onChange={(e) => pickFile(e.target.files)}
                  />
                </label>
              )}
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
              Drop a photo or video of Queen, or click to choose
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
        disabled={submitting || (!isEditing && !file && !selectedQueenPicture)}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isEditing ? "Saving…" : "Offering…"}
          </>
        ) : (
          <>
            <Crown className="mr-2 h-4 w-4" />
            {isEditing ? "Save" : "Add to gallery"}
          </>
        )}
      </Button>
    </form>
  );
}
