"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { resolveImageLocation } from "@/lib/location";
import { presignAndUpload, removeObject, signObjectUrl } from "@/lib/storage/client";
import { formatRoleSpeech } from "@/lib/role-speech";
import { notifyWorshipThread } from "@/lib/inbox";
import type { QueenPictureSource } from "@/lib/queen-picture-sources";
import {
  isOwnedWorshipUpload,
  signWorshipEntryUrl,
} from "@/lib/worship-storage";
import { loveColor, loveLabel } from "@/lib/worship";
import { QueenPicturesPicker } from "@/components/worship/queen-pictures-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { WorshipEntryWithSignedUrl } from "@/lib/types";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

  const setImage = useCallback(
    (next: File | null) => {
      if (preview) URL.revokeObjectURL(preview);
      setFile(next);
      setPreview(next ? URL.createObjectURL(next) : null);
    },
    [preview]
  );

  const pickFile = (incoming: FileList | File[] | null) => {
    const candidate = incoming?.[0];
    if (!candidate) return;
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      toast.error("Use a JPG, PNG, WebP, or GIF image");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      toast.error("Image must be under 10MB");
      return;
    }
    setImage(candidate);
    setSelectedQueenPicture(null);
    setPhotoMode("upload");
  };

  const onSelectQueenPicture = (source: QueenPictureSource | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setSelectedQueenPicture(source);
    if (source) setPhotoMode("queen");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSlave || !profile) {
      toast.error("Only D can add worship");
      return;
    }
    if (!isEditing && !file && !selectedQueenPicture) {
      toast.error("Attach a photo of Queen or pick one from her gifts");
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
        signedUrl = selectedQueenPicture.signedUrl;
      } else if (file) {
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

      if (!imagePath) {
        throw new Error("Image is required");
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
          signedUrl: signedUrl ?? existingImageUrl ?? undefined,
        });
        onCancelEdit?.();
      } else {
        const { error: insertError } = await supabase
          .from("worship_entries")
          .insert({
            created_by: profile.id,
            gallery_id: galleryId,
            ...payload,
          });

        if (insertError) {
          if (insertError.code === "23505") {
            toast.error("That picture is already in this gallery");
            return;
          }
          throw insertError;
        }

        toast.success("Photo added to gallery");
        void notifyWorshipThread(supabase, {
          senderId: profile.id,
          content:
            title.trim() ||
            description.trim().slice(0, 120) ||
            `New photo in ${galleryTopic ?? "gallery"}`,
          galleryId,
          pushTitle: "New worship photo",
          pushBody:
            title.trim() ||
            description.trim().slice(0, 80) ||
            galleryTopic ||
            "D added a photo of you",
          notifyTarget: "queen",
        });
        setTitle("");
        setDescription("");
        setLoveLevel(50);
        setImage(null);
        setSelectedQueenPicture(null);
        setPhotoMode("upload");
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
              {isEditing ? "Edit photo" : "Add photo"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEditing
                ? "Update the photo, description, or love rating"
                : galleryTopic
                  ? `Add to “${galleryTopic}”`
                  : "Upload a photo of Queen for this gallery"}
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
              From Queen&apos;s pictures
            </button>
          )}
        </div>

        <Label>{isEditing ? "Photo (optional replace)" : "Photo of Queen"}</Label>

        {!isEditing && photoMode === "queen" ? (
          <div className="space-y-3">
            <QueenPicturesPicker
              galleryId={galleryId}
              selected={selectedQueenPicture}
              onSelect={onSelectQueenPicture}
            />
            {selectedQueenPicture?.signedUrl && (
              <div className="relative overflow-hidden rounded-lg border border-gold/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedQueenPicture.signedUrl}
                  alt={selectedQueenPicture.label}
                  className="max-h-64 w-full object-contain bg-void"
                />
              </div>
            )}
          </div>
        ) : displayPreview ? (
          <div className="relative overflow-hidden rounded-lg border border-gold/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayPreview}
              alt="Worship preview"
              className="max-h-80 w-full object-contain bg-void"
            />
            <div className="absolute right-2 top-2 flex gap-2">
              {(file || selectedQueenPicture) && (
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    setSelectedQueenPicture(null);
                  }}
                  className="rounded-full bg-void/80 p-1.5 text-ivory hover:text-gold"
                  aria-label="Remove selected image"
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
              Drop a photo of Queen or click to choose
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
            {isEditing ? "Save photo" : "Add photo"}
          </>
        )}
      </Button>
    </form>
  );
}
