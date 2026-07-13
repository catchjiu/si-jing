"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleSpeech } from "@/lib/role-speech";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { resolveImageLocation } from "@/lib/location";
import { presignAndUpload } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DURATION_OPTIONS = [
  { value: "off", label: "No timed burn" },
  { value: "5", label: "5 seconds" },
  { value: "10", label: "10 seconds" },
  { value: "30", label: "30 seconds" },
];

interface InboxTeaseFormProps {
  recipientId: string;
  onSuccess?: (createdId: string, summary: string) => void;
  className?: string;
}

export function InboxTeaseForm({
  recipientId,
  onSuccess,
  className,
}: InboxTeaseFormProps) {
  const { profile, isQueen } = useAuth();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [unlockLocal, setUnlockLocal] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [startBlurred, setStartBlurred] = useState(true);
  const [viewDuration, setViewDuration] = useState("5");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isQueen) return;
  }, [isQueen]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile) {
      toast.error("Only Queen can send teases");
      return;
    }
    if (!title.trim() && !message.trim() && !file) {
      toast.error("Add a title, message, or image");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    try {
      let imagePath: string | null = null;
      let geo: Awaited<ReturnType<typeof resolveImageLocation>> = null;
      if (file) {
        geo = await resolveImageLocation(file);
        const uploadFile = await downsizeImageIfNeeded(file);
        const ext = uploadFile.name.split(".").pop() || "jpg";
        imagePath = await presignAndUpload({
          bucket: "teases",
          file: uploadFile,
          contentType: uploadFile.type || "image/jpeg",
          ext,
          relativePath: `${profile.id}/${Date.now()}.${ext}`,
        });
      }

      const unlocks = unlockLocal ? new Date(unlockLocal) : new Date();
      const blurred = !!imagePath && startBlurred;
      const duration =
        imagePath && viewDuration !== "off"
          ? parseInt(viewDuration, 10)
          : null;

      const speechTitle = title.trim()
        ? formatRoleSpeech(title.trim(), "queen")
        : null;
      const speechMessage = message.trim()
        ? formatRoleSpeech(message.trim(), "queen")
        : null;

      const { data: created, error } = await supabase
        .from("teases")
        .insert({
          sent_by: profile.id,
          sent_to: recipientId,
          title: speechTitle,
          message: speechMessage,
          image_path: imagePath,
          unlocks_at: unlocks.toISOString(),
          is_blurred: blurred,
          blur_amount: blurred ? 20 : 0,
          unblurred_at: blurred ? null : new Date().toISOString(),
          view_duration_seconds: duration,
          latitude: geo?.latitude ?? null,
          longitude: geo?.longitude ?? null,
          accuracy_m: geo?.accuracy_m ?? null,
          location_source: geo?.source ?? null,
        })
        .select("id")
        .single();

      if (error) throw error;
      if (!created?.id) throw new Error("Tease was not created");

      toast.success("Tease queued");
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "New tease",
          body: speechTitle || speechMessage || "Queen sent a tease",
          url: "/dashboard/inbox",
          target: "slave",
        })
      );
      onSuccess?.(
        created.id,
        speechTitle || speechMessage || "New tease"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send tease");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-gold/20 bg-void/60"
        />
      </div>
      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="border-gold/20 bg-void/60"
        />
      </div>
      <div className="space-y-2">
        <Label>Available from (optional)</Label>
        <Input
          type="datetime-local"
          value={unlockLocal}
          onChange={(e) => setUnlockLocal(e.target.value)}
          className="border-gold/20 bg-void/60"
        />
      </div>
      <div className="space-y-2">
        <Label>Image</Label>
        <Input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="border-gold/20 bg-void/60"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-ivory/80">
        <Checkbox
          checked={startBlurred}
          onCheckedChange={(v) => setStartBlurred(v === true)}
        />
        Start blurred
      </label>
      <div className="space-y-2">
        <Label>Timed view</Label>
        <Select value={viewDuration} onValueChange={setViewDuration}>
          <SelectTrigger className="border-gold/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Send tease
      </Button>
    </form>
  );
}
