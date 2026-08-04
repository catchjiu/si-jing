"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  ImagePlus,
  Images,
  Loader2,
  Lock,
  Share2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { JournalVisibility } from "@/lib/types";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { readImageDateTime, resolveImageLocation } from "@/lib/location";
import { SLAVE_PLACE } from "@/lib/partner-locations";
import { presignAndUpload } from "@/lib/storage/client";
import {
  hmInZone,
  ymdInZone,
  zonedWallTimeToUtc,
} from "@/lib/timezone";
import { formatRoleSpeech } from "@/lib/role-speech";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TIMELINE_PHOTOS = 12;
const TZ = SLAVE_PLACE.timeZone;

type FormMode = "write" | "timeline";

type TimelinePhoto = {
  id: string;
  file: File;
  preview: string;
  dateYmd: string;
  timeHm: string;
};

interface JournalEntryFormProps {
  onSuccess?: (entryId?: string) => void;
  className?: string;
}

function wallNow() {
  const now = new Date();
  return {
    dateYmd: ymdInZone(now, TZ),
    timeHm: hmInZone(now, TZ),
  };
}

function takenAtIso(dateYmd: string, timeHm: string): string {
  return zonedWallTimeToUtc(dateYmd, timeHm, TZ).toISOString();
}

export function JournalEntryForm({ onSuccess, className }: JournalEntryFormProps) {
  const { profile, isSlave } = useAuth();
  const [mode, setMode] = useState<FormMode>("write");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<JournalVisibility>("shared");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [timelinePhotos, setTimelinePhotos] = useState<TimelinePhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const timelineFileRef = useRef<HTMLInputElement>(null);

  const clearImage = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [preview]);

  const clearTimeline = useCallback(() => {
    setTimelinePhotos((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.preview);
      return [];
    });
    if (timelineFileRef.current) timelineFileRef.current.value = "";
  }, []);

  const pickImage = (incoming: FileList | File[] | null) => {
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
    if (preview) URL.revokeObjectURL(preview);
    setFile(candidate);
    setPreview(URL.createObjectURL(candidate));
  };

  const pickTimelineImages = async (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const remaining = MAX_TIMELINE_PHOTOS - timelinePhotos.length;
    if (remaining <= 0) {
      toast.error(`Up to ${MAX_TIMELINE_PHOTOS} photos per timeline`);
      return;
    }

    const selected = Array.from(incoming).slice(0, remaining);
    const next: TimelinePhoto[] = [];
    const fallback = wallNow();

    for (const candidate of selected) {
      if (!ACCEPTED_TYPES.includes(candidate.type)) {
        toast.error(`${candidate.name}: use JPG, PNG, WebP, or GIF`);
        continue;
      }
      if (candidate.size > MAX_FILE_SIZE) {
        toast.error(`${candidate.name}: must be under 10MB`);
        continue;
      }
      const exifDate = await readImageDateTime(candidate);
      const dateYmd = exifDate ? ymdInZone(exifDate, TZ) : fallback.dateYmd;
      const timeHm = exifDate ? hmInZone(exifDate, TZ) : fallback.timeHm;
      next.push({
        id: crypto.randomUUID(),
        file: candidate,
        preview: URL.createObjectURL(candidate),
        dateYmd,
        timeHm,
      });
    }

    if (next.length) {
      setTimelinePhotos((prev) => [...prev, ...next]);
    }
    if (timelineFileRef.current) timelineFileRef.current.value = "";
  };

  const removeTimelinePhoto = (id: string) => {
    setTimelinePhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const updateTimelinePhoto = (
    id: string,
    patch: Partial<Pick<TimelinePhoto, "dateYmd" | "timeHm">>
  ) => {
    setTimelinePhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  };

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    return () => {
      for (const p of timelinePhotos) URL.revokeObjectURL(p.preview);
    };
    // Only revoke on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit =
    mode === "write"
      ? Boolean(body.trim() || file)
      : timelinePhotos.length > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSlave || !profile) {
      toast.error("Only D can write journal entries");
      return;
    }
    if (!canSubmit) {
      toast.error(
        mode === "timeline"
          ? "Add at least one photo"
          : "Write something or attach a photo"
      );
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    const trimmedBody = body.trim();

    try {
      if (mode === "timeline") {
        const sorted = [...timelinePhotos].sort((a, b) =>
          takenAtIso(a.dateYmd, a.timeHm).localeCompare(
            takenAtIso(b.dateYmd, b.timeHm)
          )
        );
        const entryId = crypto.randomUUID();
        const uploaded: {
          image_path: string;
          sort_order: number;
          taken_at: string;
          latitude: number | null;
          longitude: number | null;
          accuracy_m: number | null;
          location_source: "exif" | "device" | null;
        }[] = [];

        for (let i = 0; i < sorted.length; i++) {
          const photo = sorted[i]!;
          const geo = await resolveImageLocation(photo.file);
          const uploadFile = await downsizeImageIfNeeded(photo.file);
          const ext = uploadFile.name.split(".").pop() || "jpg";
          const imagePath = await presignAndUpload({
            bucket: "journal",
            file: uploadFile,
            contentType: uploadFile.type || "image/jpeg",
            ext,
            relativePath: `${profile.id}/entries/${entryId}/${Date.now()}-${i}.${ext}`,
          });
          uploaded.push({
            image_path: imagePath,
            sort_order: i,
            taken_at: takenAtIso(photo.dateYmd, photo.timeHm),
            latitude: geo?.latitude ?? null,
            longitude: geo?.longitude ?? null,
            accuracy_m: geo?.accuracy_m ?? null,
            location_source: geo?.source ?? null,
          });
        }

        const cover = uploaded[0]!;
        // Post date (Taipei) for list grouping; per-photo taken_at stays on images
        const entryDate = ymdInZone(new Date(), TZ);

        const { error: entryError } = await supabase
          .from("journal_entries")
          .insert({
            id: entryId,
            author_id: profile.id,
            body: trimmedBody
              ? formatRoleSpeech(trimmedBody, "slave")
              : "",
            visibility,
            entry_date: entryDate,
            updated_at: now,
            image_path: cover.image_path,
            latitude: cover.latitude,
            longitude: cover.longitude,
            accuracy_m: cover.accuracy_m,
            location_source: cover.location_source,
          });

        if (entryError) throw entryError;

        const { error: imagesError } = await supabase
          .from("journal_entry_images")
          .insert(
            uploaded.map((img) => ({
              entry_id: entryId,
              image_path: img.image_path,
              sort_order: img.sort_order,
              taken_at: img.taken_at,
              latitude: img.latitude,
              longitude: img.longitude,
              accuracy_m: img.accuracy_m,
              location_source: img.location_source,
            }))
          );

        if (imagesError) throw imagesError;

        toast.success("Timeline saved");
        if (visibility === "shared") {
          const notifyBody =
            trimmedBody.slice(0, 120) ||
            `Sent ${uploaded.length} timeline photo${uploaded.length === 1 ? "" : "s"}`;
          void import("@/lib/push-client").then(({ notifyPush }) =>
            notifyPush({
              title: "New journal timeline",
              body: notifyBody,
              url: "/dashboard/journal",
              target: "queen",
            })
          );
        }
        setBody("");
        clearTimeline();
        onSuccess?.(entryId);
        return;
      }

      let imagePath: string | null = null;
      let latitude: number | null = null;
      let longitude: number | null = null;
      let accuracy_m: number | null = null;
      let location_source: "exif" | "device" | null = null;

      if (file) {
        const geo = await resolveImageLocation(file);
        if (geo) {
          latitude = geo.latitude;
          longitude = geo.longitude;
          accuracy_m = geo.accuracy_m;
          location_source = geo.source;
        }
        const uploadFile = await downsizeImageIfNeeded(file);
        const ext = uploadFile.name.split(".").pop() || "jpg";
        imagePath = await presignAndUpload({
          bucket: "journal",
          file: uploadFile,
          contentType: uploadFile.type || "image/jpeg",
          ext,
          relativePath: `${profile.id}/entries/${Date.now()}.${ext}`,
        });
      }

      const { data, error } = await supabase
        .from("journal_entries")
        .insert({
          author_id: profile.id,
          body: trimmedBody
            ? formatRoleSpeech(trimmedBody, "slave")
            : "",
          visibility,
          entry_date: ymdInZone(new Date(), TZ),
          updated_at: now,
          image_path: imagePath,
          latitude,
          longitude,
          accuracy_m,
          location_source,
        })
        .select("id")
        .single();

      if (error) throw error;

      if (imagePath && data?.id) {
        await supabase.from("journal_entry_images").insert({
          entry_id: data.id as string,
          image_path: imagePath,
          sort_order: 0,
          taken_at: now,
          latitude,
          longitude,
          accuracy_m,
          location_source,
        });
      }

      toast.success("Journal entry saved");
      if (visibility === "shared") {
        const notifyBody =
          trimmedBody.slice(0, 120) || (imagePath ? "Sent a photo" : "");
        void import("@/lib/push-client").then(({ notifyPush }) =>
          notifyPush({
            title: "New journal entry",
            body: notifyBody,
            url: "/dashboard/journal",
            target: "queen",
          })
        );
      }
      setBody("");
      clearImage();
      onSuccess?.(data?.id as string);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save entry");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSlave) return null;

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-5 sm:p-6",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-gold" />
        <div>
          <h3 className="font-heading text-xl text-ivory">Today&apos;s reflection</h3>
          <p className="text-xs text-muted-foreground">
            Private thoughts or shared with Queen
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "write" ? "default" : "outline"}
          className={
            mode === "write"
              ? "bg-gold text-void hover:bg-gold-muted"
              : "border-gold/25"
          }
          onClick={() => setMode("write")}
          disabled={submitting}
        >
          <BookOpen className="mr-1.5 h-3.5 w-3.5" />
          Write
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "timeline" ? "default" : "outline"}
          className={
            mode === "timeline"
              ? "bg-gold text-void hover:bg-gold-muted"
              : "border-gold/25"
          }
          onClick={() => setMode("timeline")}
          disabled={submitting}
        >
          <Images className="mr-1.5 h-3.5 w-3.5" />
          Timeline
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="journal-body">
          {mode === "timeline" ? "Caption (optional)" : "Entry"}
        </Label>
        <Textarea
          id="journal-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={mode === "timeline" ? 3 : 5}
          placeholder={
            mode === "timeline"
              ? "A short note for this photo timeline…"
              : "How did today feel? What are you learning about yourself?"
          }
          className="border-gold/20 bg-void/60"
        />
      </div>

      {mode === "write" ? (
        <div className="space-y-2">
          <Label>Photo (optional)</Label>
          {preview ? (
            <div className="relative inline-block overflow-hidden rounded-lg border border-gold/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Selected"
                className="h-32 w-auto max-w-full object-cover"
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
          ) : (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                className="hidden"
                onChange={(e) => pickImage(e.target.files)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-gold/25"
                onClick={() => fileRef.current?.click()}
                disabled={submitting}
              >
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                Add photo
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>
              Photos{" "}
              <span className="text-muted-foreground">
                ({timelinePhotos.length}/{MAX_TIMELINE_PHOTOS}) · times in{" "}
                {SLAVE_PLACE.zoneShort}
              </span>
            </Label>
            <div>
              <input
                ref={timelineFileRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                multiple
                className="hidden"
                onChange={(e) => void pickTimelineImages(e.target.files)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-gold/25"
                onClick={() => timelineFileRef.current?.click()}
                disabled={
                  submitting || timelinePhotos.length >= MAX_TIMELINE_PHOTOS
                }
              >
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                Add photos
              </Button>
            </div>
          </div>

          {timelinePhotos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Pick a few photos — dates and times come from the images when
              available, and you can edit them.
            </p>
          ) : (
            <ul className="space-y-3">
              {timelinePhotos.map((photo) => (
                <li
                  key={photo.id}
                  className="flex flex-col gap-3 rounded-lg border border-gold/15 bg-void/40 p-3 sm:flex-row sm:items-center"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-gold/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.preview}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeTimelinePhoto(photo.id)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-void/80 p-0.5 text-ivory"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid flex-1 grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label
                        htmlFor={`tl-date-${photo.id}`}
                        className="text-[10px] uppercase tracking-wider text-muted-foreground"
                      >
                        Date
                      </Label>
                      <Input
                        id={`tl-date-${photo.id}`}
                        type="date"
                        value={photo.dateYmd}
                        onChange={(e) =>
                          updateTimelinePhoto(photo.id, {
                            dateYmd: e.target.value,
                          })
                        }
                        className="border-gold/20 bg-void/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`tl-time-${photo.id}`}
                        className="text-[10px] uppercase tracking-wider text-muted-foreground"
                      >
                        Time
                      </Label>
                      <Input
                        id={`tl-time-${photo.id}`}
                        type="time"
                        value={photo.timeHm}
                        onChange={(e) =>
                          updateTimelinePhoto(photo.id, {
                            timeHm: e.target.value,
                          })
                        }
                        className="border-gold/20 bg-void/60"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Visibility</Label>
        <Select
          value={visibility}
          onValueChange={(v) => setVisibility(v as JournalVisibility)}
        >
          <SelectTrigger className="border-gold/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shared">
              <span className="flex items-center gap-2">
                <Share2 className="h-3.5 w-3.5" />
                Shared with Queen
              </span>
            </SelectItem>
            <SelectItem value="private">
              <span className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                Private (only you)
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        disabled={submitting || !canSubmit}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : mode === "timeline" ? (
          <Images className="mr-2 h-4 w-4" />
        ) : (
          <BookOpen className="mr-2 h-4 w-4" />
        )}
        {mode === "timeline" ? "Save timeline" : "Save entry"}
      </Button>
    </form>
  );
}
