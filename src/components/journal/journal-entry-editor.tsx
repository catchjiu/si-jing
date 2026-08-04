"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Lock, Share2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type {
  JournalEntryImageWithSignedUrl,
  JournalEntryWithSignedUrl,
  JournalVisibility,
} from "@/lib/types";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { readImageDateTime, resolveImageLocation } from "@/lib/location";
import { SLAVE_PLACE } from "@/lib/partner-locations";
import { presignAndUpload, removeObject } from "@/lib/storage/client";
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

type ExistingPhoto = {
  id: string;
  image_path: string;
  preview?: string;
  dateYmd: string;
  timeHm: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_m?: number | null;
  location_source?: "exif" | "device" | null;
};

type NewPhoto = {
  id: string;
  file: File;
  preview: string;
  dateYmd: string;
  timeHm: string;
};

function wallFromIso(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return {
    dateYmd: ymdInZone(safe, TZ),
    timeHm: hmInZone(safe, TZ),
  };
}

function takenAtIso(dateYmd: string, timeHm: string): string {
  return zonedWallTimeToUtc(dateYmd, timeHm, TZ).toISOString();
}

function seedExisting(entry: JournalEntryWithSignedUrl): ExistingPhoto[] {
  const images = entry.images ?? [];
  if (images.length > 0) {
    return images.map((img: JournalEntryImageWithSignedUrl) => {
      const wall = wallFromIso(img.taken_at ?? img.created_at);
      return {
        id: img.id,
        image_path: img.image_path,
        preview: img.signedUrl,
        dateYmd: wall.dateYmd,
        timeHm: wall.timeHm,
        latitude: img.latitude,
        longitude: img.longitude,
        accuracy_m: img.accuracy_m,
        location_source: img.location_source ?? null,
      };
    });
  }
  if (entry.image_path) {
    const wall = wallFromIso(entry.created_at);
    return [
      {
        id: `legacy-${entry.id}`,
        image_path: entry.image_path,
        preview: entry.signedUrl,
        dateYmd: wall.dateYmd,
        timeHm: wall.timeHm,
        latitude: entry.latitude,
        longitude: entry.longitude,
        accuracy_m: entry.accuracy_m,
        location_source: entry.location_source ?? null,
      },
    ];
  }
  return [];
}

type JournalEntryEditorProps = {
  entry: JournalEntryWithSignedUrl;
  onCancel: () => void;
  onSaved: () => void;
  className?: string;
};

export function JournalEntryEditor({
  entry,
  onCancel,
  onSaved,
  className,
}: JournalEntryEditorProps) {
  const { profile, isSlave } = useAuth();
  const [body, setBody] = useState(entry.body);
  const [visibility, setVisibility] = useState<JournalVisibility>(
    entry.visibility as JournalVisibility
  );
  const [existing, setExisting] = useState<ExistingPhoto[]>(() =>
    seedExisting(entry)
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      for (const p of newPhotos) URL.revokeObjectURL(p.preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPhotos = existing.length + newPhotos.length;
  const canSave = Boolean(body.trim() || totalPhotos > 0);

  const pickNewPhotos = async (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const remaining = MAX_TIMELINE_PHOTOS - totalPhotos;
    if (remaining <= 0) {
      toast.error(`Up to ${MAX_TIMELINE_PHOTOS} photos per timeline`);
      return;
    }

    const selected = Array.from(incoming).slice(0, remaining);
    const next: NewPhoto[] = [];
    const fallback = wallFromIso(null);

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
      next.push({
        id: crypto.randomUUID(),
        file: candidate,
        preview: URL.createObjectURL(candidate),
        dateYmd: exifDate ? ymdInZone(exifDate, TZ) : fallback.dateYmd,
        timeHm: exifDate ? hmInZone(exifDate, TZ) : fallback.timeHm,
      });
    }

    if (next.length) setNewPhotos((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeExisting = (id: string) => {
    setExisting((prev) => prev.filter((p) => p.id !== id));
    if (!id.startsWith("legacy-")) {
      setRemovedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  };

  const removeNew = (id: string) => {
    setNewPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSlave || !profile) {
      toast.error("Only D can edit journal entries");
      return;
    }
    if (!canSave) {
      toast.error("Keep a caption or at least one photo");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    const trimmedBody = body.trim();

    try {
      // Delete removed child rows (+ storage)
      for (const id of removedIds) {
        const doomed = (entry.images ?? []).find((img) => img.id === id);
        const { error: delErr } = await supabase
          .from("journal_entry_images")
          .delete()
          .eq("id", id)
          .eq("entry_id", entry.id);
        if (delErr) throw delErr;
        if (doomed?.image_path) {
          try {
            await removeObject({
              bucket: "journal",
              path: doomed.image_path,
            });
          } catch {
            // Keep edit succeeding if storage delete fails
          }
        }
      }

      const hadLegacy = (entry.images ?? []).length === 0 && Boolean(entry.image_path);
      const legacyRemoved =
        hadLegacy && !existing.some((p) => p.id.startsWith("legacy-"));
      if (legacyRemoved && entry.image_path) {
        try {
          await removeObject({
            bucket: "journal",
            path: entry.image_path,
          });
        } catch {
          // Keep edit succeeding if storage delete fails
        }
      }

      // Update taken_at on kept real rows
      for (const photo of existing) {
        if (photo.id.startsWith("legacy-")) continue;
        const { error: updErr } = await supabase
          .from("journal_entry_images")
          .update({
            taken_at: takenAtIso(photo.dateYmd, photo.timeHm),
          })
          .eq("id", photo.id)
          .eq("entry_id", entry.id);
        if (updErr) throw updErr;
      }

      // Upload + insert new photos
      const uploaded: {
        image_path: string;
        taken_at: string;
        latitude: number | null;
        longitude: number | null;
        accuracy_m: number | null;
        location_source: "exif" | "device" | null;
        dateYmd: string;
        timeHm: string;
      }[] = [];

      for (let i = 0; i < newPhotos.length; i++) {
        const photo = newPhotos[i]!;
        const geo = await resolveImageLocation(photo.file);
        const uploadFile = await downsizeImageIfNeeded(photo.file);
        const ext = uploadFile.name.split(".").pop() || "jpg";
        const imagePath = await presignAndUpload({
          bucket: "journal",
          file: uploadFile,
          contentType: uploadFile.type || "image/jpeg",
          ext,
          relativePath: `${profile.id}/entries/${entry.id}/${Date.now()}-${i}.${ext}`,
        });
        uploaded.push({
          image_path: imagePath,
          taken_at: takenAtIso(photo.dateYmd, photo.timeHm),
          latitude: geo?.latitude ?? null,
          longitude: geo?.longitude ?? null,
          accuracy_m: geo?.accuracy_m ?? null,
          location_source: geo?.source ?? null,
          dateYmd: photo.dateYmd,
          timeHm: photo.timeHm,
        });
      }

      if (uploaded.length) {
        const maxSort = Math.max(
          0,
          ...(entry.images ?? []).map((img) => img.sort_order),
          existing.length - 1
        );
        const { error: insertErr } = await supabase
          .from("journal_entry_images")
          .insert(
            uploaded.map((img, idx) => ({
              entry_id: entry.id,
              image_path: img.image_path,
              sort_order: maxSort + 1 + idx,
              taken_at: img.taken_at,
              latitude: img.latitude,
              longitude: img.longitude,
              accuracy_m: img.accuracy_m,
              location_source: img.location_source,
            }))
          );
        if (insertErr) throw insertErr;
      }

      // Ensure legacy cover is represented as a child row if still kept
      const legacyKept = existing.find((p) => p.id.startsWith("legacy-"));
      if (legacyKept) {
        const { data: existingChildren } = await supabase
          .from("journal_entry_images")
          .select("id")
          .eq("entry_id", entry.id)
          .limit(1);
        if (!existingChildren?.length) {
          const { error: legacyInsErr } = await supabase
            .from("journal_entry_images")
            .insert({
              entry_id: entry.id,
              image_path: legacyKept.image_path,
              sort_order: 0,
              taken_at: takenAtIso(legacyKept.dateYmd, legacyKept.timeHm),
              latitude: legacyKept.latitude ?? null,
              longitude: legacyKept.longitude ?? null,
              accuracy_m: legacyKept.accuracy_m ?? null,
              location_source: legacyKept.location_source ?? null,
            });
          if (legacyInsErr) throw legacyInsErr;
        }
      }

      // Build cover from earliest remaining photo (existing + newly uploaded)
      const coverCandidates = [
        ...existing.map((p) => ({
          image_path: p.image_path,
          taken_at: takenAtIso(p.dateYmd, p.timeHm),
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
          accuracy_m: p.accuracy_m ?? null,
          location_source: p.location_source ?? null,
        })),
        ...uploaded.map((p) => ({
          image_path: p.image_path,
          taken_at: p.taken_at,
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy_m: p.accuracy_m,
          location_source: p.location_source,
        })),
      ].sort((a, b) => a.taken_at.localeCompare(b.taken_at));

      const cover = coverCandidates[0];

      const { error: entryErr } = await supabase
        .from("journal_entries")
        .update({
          body: trimmedBody ? formatRoleSpeech(trimmedBody, "slave") : "",
          visibility,
          updated_at: now,
          image_path: cover?.image_path ?? null,
          latitude: cover?.latitude ?? null,
          longitude: cover?.longitude ?? null,
          accuracy_m: cover?.accuracy_m ?? null,
          location_source: cover?.location_source ?? null,
        })
        .eq("id", entry.id)
        .eq("author_id", profile.id);

      if (entryErr) throw entryErr;

      toast.success("Entry updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update entry");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSlave) return null;

  return (
    <form
      onSubmit={onSave}
      className={cn(
        "mt-3 space-y-4 rounded-lg border border-gold/25 bg-void/50 p-4",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-gold/90">
          Edit entry
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-muted-foreground"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`edit-body-${entry.id}`}>Caption</Label>
        <Textarea
          id={`edit-body-${entry.id}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="border-gold/20 bg-void/60"
        />
      </div>

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

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>
            Photos{" "}
            <span className="text-muted-foreground">
              ({totalPhotos}/{MAX_TIMELINE_PHOTOS}) · {SLAVE_PLACE.zoneShort}
            </span>
          </Label>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={(e) => void pickNewPhotos(e.target.files)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-gold/25"
              onClick={() => fileRef.current?.click()}
              disabled={submitting || totalPhotos >= MAX_TIMELINE_PHOTOS}
            >
              <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
              Add photos
            </Button>
          </div>
        </div>

        {totalPhotos === 0 ? (
          <p className="text-xs text-muted-foreground">
            No photos yet — add some to build a timeline.
          </p>
        ) : (
          <ul className="space-y-3">
            {existing.map((photo) => (
              <li
                key={photo.id}
                className="flex flex-col gap-3 rounded-lg border border-gold/15 bg-charcoal/60 p-3 sm:flex-row sm:items-center"
              >
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-gold/15">
                  {photo.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.preview}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                      Photo
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeExisting(photo.id)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-void/80 p-0.5 text-ivory"
                    aria-label="Remove photo"
                    disabled={submitting}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Date
                    </Label>
                    <Input
                      type="date"
                      value={photo.dateYmd}
                      onChange={(e) =>
                        setExisting((prev) =>
                          prev.map((p) =>
                            p.id === photo.id
                              ? { ...p, dateYmd: e.target.value }
                              : p
                          )
                        )
                      }
                      className="border-gold/20 bg-void/60"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Time
                    </Label>
                    <Input
                      type="time"
                      value={photo.timeHm}
                      onChange={(e) =>
                        setExisting((prev) =>
                          prev.map((p) =>
                            p.id === photo.id
                              ? { ...p, timeHm: e.target.value }
                              : p
                          )
                        )
                      }
                      className="border-gold/20 bg-void/60"
                    />
                  </div>
                </div>
              </li>
            ))}
            {newPhotos.map((photo) => (
              <li
                key={photo.id}
                className="flex flex-col gap-3 rounded-lg border border-dashed border-gold/30 bg-charcoal/60 p-3 sm:flex-row sm:items-center"
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
                    onClick={() => removeNew(photo.id)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-void/80 p-0.5 text-ivory"
                    aria-label="Remove photo"
                    disabled={submitting}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Date
                    </Label>
                    <Input
                      type="date"
                      value={photo.dateYmd}
                      onChange={(e) =>
                        setNewPhotos((prev) =>
                          prev.map((p) =>
                            p.id === photo.id
                              ? { ...p, dateYmd: e.target.value }
                              : p
                          )
                        )
                      }
                      className="border-gold/20 bg-void/60"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Time
                    </Label>
                    <Input
                      type="time"
                      value={photo.timeHm}
                      onChange={(e) =>
                        setNewPhotos((prev) =>
                          prev.map((p) =>
                            p.id === photo.id
                              ? { ...p, timeHm: e.target.value }
                              : p
                          )
                        )
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

      <Button
        type="submit"
        disabled={submitting || !canSave}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Save changes
      </Button>
    </form>
  );
}
