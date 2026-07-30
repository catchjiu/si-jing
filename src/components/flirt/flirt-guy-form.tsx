"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { presignAndUpload } from "@/lib/storage/client";
import type { FlirtStatus, Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlirtStatusSelector } from "@/components/flirt/flirt-status-badge";
import {
  FlirtHotnessSlider,
  FlirtInterestSlider,
} from "@/components/flirt/flirt-interest-slider";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type Props = {
  recipient: Profile;
  onCreated: (guyId: string) => void;
};

export function FlirtGuyForm({ recipient, onCreated }: Props) {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<FlirtStatus>("looked");
  const [interest, setInterest] = useState(50);
  const [hotness, setHotness] = useState(50);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clearPhoto = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
  };

  const pickPhoto = (f: File | null) => {
    clearPhoto();
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) {
      toast.error("Use a photo (JPEG, PNG, WebP, or GIF)");
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      toast.error("Photo too large (max 10 MB)");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Add a name");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    try {
      let photoPath: string | null = null;
      if (file) {
        const uploadFile = await downsizeImageIfNeeded(file);
        const ext = uploadFile.name.split(".").pop() || "jpg";
        photoPath = await presignAndUpload({
          bucket: "flirt",
          file: uploadFile,
          contentType: uploadFile.type || "image/jpeg",
          ext,
          relativePath: `${profile.id}/guys/${Date.now()}.${ext}`,
        });
      }

      const { data, error } = await supabase
        .from("flirt_guys")
        .insert({
          created_by: profile.id,
          assigned_to: recipient.id,
          name: trimmed,
          photo_path: photoPath,
          status,
          interest_level: interest,
          hotness_level: hotness,
        })
        .select("id")
        .single();

      if (error) throw error;

      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Queen has a new flirt",
          body: trimmed,
          url: `/dashboard/flirt/${data.id}`,
          target: "slave",
          kind: "flirt_new",
        })
      );

      toast.success("Flirt added");
      setName("");
      setStatus("looked");
      setInterest(50);
      setHotness(50);
      clearPhoto();
      onCreated(data.id as string);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not add flirt";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-4 rounded-xl border border-gold/15 bg-charcoal/80 p-5"
    >
      <div>
        <h2 className="font-heading text-lg text-gold">Add flirt</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Name and optional photo — then add entries on his timeline
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="flirt-name">Name</Label>
        <Input
          id="flirt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="His name"
          maxLength={80}
        />
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <FlirtStatusSelector value={status} onChange={setStatus} />
      </div>

      <FlirtInterestSlider value={interest} onChange={setInterest} />
      <FlirtHotnessSlider value={hotness} onChange={setHotness} />

      <div className="space-y-2">
        <Label>Photo (optional)</Label>
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-full border border-gold/25 bg-void/50">
            {preview ? (
              <Image
                src={preview}
                alt="Preview"
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImagePlus className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                Choose photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
            </Button>
            {preview && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearPhoto}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Add flirt"
        )}
      </Button>
    </form>
  );
}
