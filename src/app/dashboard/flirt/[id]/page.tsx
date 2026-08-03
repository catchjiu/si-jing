"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Flame, HeartCrack, Loader2, Trash2, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import {
  presignAndUpload,
  signObjectUrl,
  removeObject,
} from "@/lib/storage/client";
import {
  FLIRT_STATUS_LABELS,
  type FlirtGuy,
  type FlirtStatus,
} from "@/lib/types";
import {
  FlirtStatusBadge,
  FlirtStatusSelector,
} from "@/components/flirt/flirt-status-badge";
import {
  FlirtHotnessMeter,
  FlirtHotnessSlider,
  FlirtInterestMeter,
  FlirtInterestSlider,
  FlirtJealousyMeter,
  FlirtJealousySlider,
} from "@/components/flirt/flirt-interest-slider";
import { FlirtTimeline } from "@/components/flirt/flirt-timeline";
import { FlirtCommentThread } from "@/components/flirt/flirt-comment-thread";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export default function FlirtDetailPage() {
  const params = useParams();
  const router = useRouter();
  const guyId = typeof params.id === "string" ? params.id : "";
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [guy, setGuy] = useState<FlirtGuy | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [interestDraft, setInterestDraft] = useState(50);
  const [hotnessDraft, setHotnessDraft] = useState(50);
  const [jealousyDraft, setJealousyDraft] = useState(50);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingInterest, setSavingInterest] = useState(false);
  const [savingHotness, setSavingHotness] = useState(false);
  const [savingJealousy, setSavingJealousy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!profile || !guyId) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase.from("flirt_guys").select("*").eq("id", guyId);
    if (isSlave) query = query.eq("assigned_to", profile.id);
    const { data, error } = await query.maybeSingle();
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const row = data as FlirtGuy | null;
    setGuy(row);
    setInterestDraft(row?.interest_level ?? 50);
    setHotnessDraft(row?.hotness_level ?? 50);
    setJealousyDraft(row?.jealousy_level ?? 50);
    if (row?.photo_path) {
      const url = await signObjectUrl({
        bucket: "flirt",
        path: row.photo_path,
      });
      setPhotoUrl(url);
    } else {
      setPhotoUrl(null);
    }
    setLoading(false);
  }, [profile, guyId, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const saveStatus = async (status: FlirtStatus) => {
    if (!isQueen || !guy || status === guy.status) return;
    setSavingStatus(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("flirt_guys")
      .update({ status })
      .eq("id", guy.id);
    setSavingStatus(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setGuy({ ...guy, status });
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Flirt status updated",
        body: `${guy.name} → ${FLIRT_STATUS_LABELS[status]}`,
        url: `/dashboard/flirt/${guy.id}`,
        target: "slave",
        kind: "flirt_status",
      })
    );
    toast.success("Status updated");
  };

  const saveInterest = async () => {
    if (!isQueen || !guy) return;
    if (interestDraft === guy.interest_level) return;
    setSavingInterest(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("flirt_guys")
      .update({ interest_level: interestDraft })
      .eq("id", guy.id);
    setSavingInterest(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setGuy({ ...guy, interest_level: interestDraft });
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Flirt interest updated",
        body: `${guy.name}: interest ${interestDraft}%`,
        url: `/dashboard/flirt/${guy.id}`,
        target: "slave",
        kind: "flirt_interest",
      })
    );
    toast.success("Interest saved");
  };

  const saveHotness = async () => {
    if (!isQueen || !guy) return;
    if (hotnessDraft === guy.hotness_level) return;
    setSavingHotness(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("flirt_guys")
      .update({ hotness_level: hotnessDraft })
      .eq("id", guy.id);
    setSavingHotness(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setGuy({ ...guy, hotness_level: hotnessDraft });
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Flirt hotness updated",
        body: `${guy.name}: hotness ${hotnessDraft}%`,
        url: `/dashboard/flirt/${guy.id}`,
        target: "slave",
        kind: "flirt_hotness",
      })
    );
    toast.success("Hotness saved");
  };

  const saveJealousy = async () => {
    if (!isSlave || !guy) return;
    if (jealousyDraft === guy.jealousy_level) return;
    setSavingJealousy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("flirt_guys")
      .update({ jealousy_level: jealousyDraft })
      .eq("id", guy.id);
    setSavingJealousy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setGuy({ ...guy, jealousy_level: jealousyDraft });
    toast.success("Jealousy saved");
  };

  const uploadPhoto = async (file: File) => {
    if (!isQueen || !profile || !guy) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Use a photo (JPEG, PNG, WebP, or GIF)");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Photo too large (max 10 MB)");
      return;
    }

    setUploadingPhoto(true);
    const oldPhotoPath = guy.photo_path;
    try {
      const uploadFile = await downsizeImageIfNeeded(file);
      const ext = uploadFile.name.split(".").pop() || "jpg";
      const photoPath = await presignAndUpload({
        bucket: "flirt",
        file: uploadFile,
        contentType: uploadFile.type || "image/jpeg",
        ext,
        relativePath: `${profile.id}/guys/${Date.now()}.${ext}`,
      });

      const supabase = createClient();
      const { error } = await supabase
        .from("flirt_guys")
        .update({ photo_path: photoPath })
        .eq("id", guy.id);

      if (error) throw error;

      if (oldPhotoPath) {
        await removeObject({ bucket: "flirt", path: oldPhotoPath }).catch(
          () => undefined
        );
      }

      const url = await signObjectUrl({ bucket: "flirt", path: photoPath });
      setGuy({ ...guy, photo_path: photoPath });
      setPhotoUrl(url);
      toast.success("Photo updated");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not upload photo";
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onPhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadPhoto(file);
  };

  const deleteGuy = async () => {
    if (!isQueen || !guy) return;
    if (!window.confirm(`Remove ${guy.name} and all entries?`)) return;
    setDeleting(true);
    const supabase = createClient();
    const photoPath = guy.photo_path;
    const { error } = await supabase
      .from("flirt_guys")
      .delete()
      .eq("id", guy.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (photoPath) {
      await removeObject({ bucket: "flirt", path: photoPath }).catch(
        () => undefined
      );
    }
    toast.success("Flirt removed");
    router.push("/dashboard/flirt");
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!guy) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/flirt"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Flirt
        </Link>
        <p className="text-sm text-muted-foreground">Flirt not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/flirt"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Flirt
      </Link>

      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <div
          role={isQueen ? "button" : undefined}
          tabIndex={isQueen ? 0 : undefined}
          title={isQueen ? "Double-click to change photo" : undefined}
          onDoubleClick={() => {
            if (isQueen && !uploadingPhoto) photoInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if (
              isQueen &&
              !uploadingPhoto &&
              (e.key === "Enter" || e.key === " ")
            ) {
              e.preventDefault();
              photoInputRef.current?.click();
            }
          }}
          className={`relative h-28 w-28 shrink-0 overflow-hidden rounded-full border-2 border-gold/30 bg-void/50${
            isQueen ? " cursor-pointer hover:border-gold/50" : ""
          }`}
        >
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={guy.name}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gold/70">
              <span className="font-heading text-3xl">
                {guy.name.trim().charAt(0).toUpperCase() || (
                  <User className="h-10 w-10" />
                )}
              </span>
            </div>
          )}
          {uploadingPhoto && (
            <div className="absolute inset-0 flex items-center justify-center bg-void/70">
              <Loader2 className="h-8 w-8 animate-spin text-gold" />
            </div>
          )}
        </div>
        {isQueen && (
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPhotoSelected}
          />
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h1 className="font-heading flex items-center gap-2 text-2xl text-ivory sm:text-3xl">
              <Flame className="h-6 w-6 text-gold" />
              {guy.name}
            </h1>
            <FlirtStatusBadge status={guy.status} />
            {isQueen && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={deleting}
                onClick={() => void deleteGuy()}
                className="text-muted-foreground hover:text-red-300"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {isSlave && (
            <div className="mx-auto w-full max-w-xs space-y-3 sm:mx-0">
              <FlirtInterestMeter value={guy.interest_level} />
              <FlirtHotnessMeter value={guy.hotness_level} />
              <div className="space-y-3 rounded-xl border border-gold/10 bg-void/40 p-4 text-left">
                <p className="text-xs font-medium uppercase tracking-wider text-gold/90">
                  How you feel
                </p>
                <FlirtJealousySlider
                  value={jealousyDraft}
                  onChange={setJealousyDraft}
                  disabled={savingJealousy}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    savingJealousy || jealousyDraft === guy.jealousy_level
                  }
                  onClick={() => void saveJealousy()}
                  className="bg-gold text-void hover:bg-gold-muted"
                >
                  {savingJealousy ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Save jealousy
                </Button>
              </div>
            </div>
          )}

          {isQueen && (
            <div className="flex items-center gap-2 text-sm text-ivory">
              <HeartCrack className="h-4 w-4 text-violet-300" />
              Jealous ·{" "}
              <span className="font-heading text-gold">{guy.jealousy_level}%</span>
            </div>
          )}

          {isQueen && (
            <div className="space-y-4 rounded-xl border border-gold/15 bg-charcoal/70 p-4 text-left">
              <div className="space-y-2">
                <Label>Status</Label>
                <FlirtStatusSelector
                  value={guy.status}
                  onChange={(s) => void saveStatus(s)}
                  disabled={savingStatus}
                />
              </div>
              <div className="space-y-3">
                <FlirtInterestSlider
                  value={interestDraft}
                  onChange={setInterestDraft}
                  disabled={savingInterest}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    savingInterest || interestDraft === guy.interest_level
                  }
                  onClick={() => void saveInterest()}
                >
                  {savingInterest ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save interest"
                  )}
                </Button>
              </div>
              <div className="space-y-3">
                <FlirtHotnessSlider
                  value={hotnessDraft}
                  onChange={setHotnessDraft}
                  disabled={savingHotness}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    savingHotness || hotnessDraft === guy.hotness_level
                  }
                  onClick={() => void saveHotness()}
                >
                  {savingHotness ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save hotness"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Timeline</h2>
        <FlirtTimeline
          guyId={guy.id}
          guyName={guy.name}
          canPost={!!isQueen}
        />
      </section>

      <section className="space-y-4 rounded-2xl border border-gold/15 bg-charcoal/60 p-5">
        <h2 className="font-heading text-xl text-gold">Comments</h2>
        <FlirtCommentThread guyId={guy.id} guyName={guy.name} />
      </section>
    </div>
  );
}
