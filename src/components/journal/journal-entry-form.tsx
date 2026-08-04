"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, ImagePlus, Loader2, Lock, Share2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { JournalVisibility } from "@/lib/types";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { resolveImageLocation } from "@/lib/location";
import { presignAndUpload } from "@/lib/storage/client";
import { formatRoleSpeech } from "@/lib/role-speech";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

interface JournalEntryFormProps {
  onSuccess?: (entryId?: string) => void;
  className?: string;
}

export function JournalEntryForm({ onSuccess, className }: JournalEntryFormProps) {
  const { profile, isSlave } = useAuth();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<JournalVisibility>("shared");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const clearImage = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [preview]);

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

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const canSubmit = Boolean(body.trim() || file);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSlave || !profile) {
      toast.error("Only D can write journal entries");
      return;
    }
    if (!canSubmit) {
      toast.error("Write something or attach a photo");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const now = new Date().toISOString();

    try {
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

      const trimmedBody = body.trim();
      const { data, error } = await supabase
        .from("journal_entries")
        .insert({
          author_id: profile.id,
          body: trimmedBody
            ? formatRoleSpeech(trimmedBody, "slave")
            : "",
          visibility,
          entry_date: new Date().toISOString().slice(0, 10),
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

      <div className="space-y-2">
        <Label htmlFor="journal-body">Entry</Label>
        <Textarea
          id="journal-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="How did today feel? What are you learning about yourself?"
          className="border-gold/20 bg-void/60"
        />
      </div>

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
        ) : (
          <BookOpen className="mr-2 h-4 w-4" />
        )}
        Save entry
      </Button>
    </form>
  );
}
