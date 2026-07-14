"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatDeadline, formatRelative } from "@/lib/format";
import type { Profile, TeaseMediaKind, TeaseViewCapture, TeaseWithSignedUrl } from "@/lib/types";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { resolveImageLocation } from "@/lib/location";
import { hasPunishmentEffect } from "@/lib/punishments";
import { formatRoleSpeech } from "@/lib/role-speech";
import { prepareVideoForUpload, VIDEO_TYPES } from "@/lib/video-compress";
import { presignAndUpload, removeObject, signObjectUrl } from "@/lib/storage/client";
import {
  isTeaseReactionCaptureSupported,
  pickVideoRecorderMimeType,
  TeaseReactionRecorder,
  uploadTeaseReactionCapture,
} from "@/lib/tease-reaction-recorder";
import {
  formatTeaseViewCount,
  recordTeaseView,
  teaseWatchMetric,
} from "@/lib/tease-views";
import { TeaseSessionViewer } from "@/components/teases/protected-tease-viewer";
import { TeaseReactionCameraPip } from "@/components/teases/tease-reaction-camera-pip";
import {
  TeaseViewCapturePlayer,
} from "@/components/teases/tease-view-capture-player";
import { LazyTeaseThread } from "@/components/teases/lazy-tease-thread";
import { TeaseUnlockChecklist } from "@/components/teases/tease-unlock-checklist";
import { KeepInEvidenceButton } from "@/components/evidence/keep-in-evidence-button";
import { GeoMapLinks } from "@/components/location/geo-map-links";
import { RoleSpeech } from "@/components/ui/role-speech";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  Eye,
  EyeOff,
  Flame,
  ImagePlus,
  ListPlus,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  Video,
  X,
  Repeat2,
  BarChart3,
} from "lucide-react";

const ACCEPTED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_MEDIA = [...ACCEPTED_IMAGE, ...VIDEO_TYPES];

function isVideoFile(file: File) {
  return VIDEO_TYPES.includes(file.type as (typeof VIDEO_TYPES)[number]);
}

/** Map 0–100 → CSS blur px (100 ≈ heavy soft veil, still some shape). */
function blurStyle(amount: number): CSSProperties {
  const clamped = Math.max(0, Math.min(100, amount));
  const px = (clamped / 100) * 40;
  return {
    filter: px > 0 ? `blur(${px.toFixed(1)}px)` : undefined,
    transform: px > 0 ? "scale(1.02)" : undefined,
  };
}

function blurLabel(amount: number) {
  if (amount <= 5) return "Almost clear";
  if (amount <= 25) return "Soft tease";
  if (amount <= 50) return "Veiled";
  if (amount <= 75) return "Heavy";
  return "Barely a hint";
}

function wreckedLabel(score: number) {
  if (score <= 20) return "Barely stirred";
  if (score <= 40) return "Warming up";
  if (score <= 60) return "Getting wrecked";
  if (score <= 80) return "Messed up";
  return "Destroyed";
}

function isTimeUnlocked(unlocksAt: string) {
  return new Date(unlocksAt) <= new Date();
}

async function withSignedUrls(
  teases: TeaseWithSignedUrl[],
  {
    isQueen,
    inlineViewId,
  }: { isQueen: boolean; inlineViewId: string | null }
): Promise<TeaseWithSignedUrl[]> {
  return Promise.all(
    teases.map(async (t) => {
      if (!t.image_path) return t;
      const unlocked = isTimeUnlocked(t.unlocks_at);
      if (!isQueen && !unlocked) return { ...t, signedUrl: undefined };
      // Revealed teases open in a camera-gated session viewer
      if (!isQueen && !t.is_blurred) return { ...t, signedUrl: undefined };
      // Blurred teases: sign only while D is actively viewing inline
      if (!isQueen && t.is_blurred && inlineViewId !== t.id) {
        return { ...t, signedUrl: undefined };
      }
      const signedUrl =
        (await signObjectUrl({
          bucket: "teases",
          path: t.image_path,
          expiresIn: isQueen ? 3600 : 600,
        })) ?? undefined;
      return { ...t, signedUrl };
    })
  );
}

export default function TeasesPage() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [items, setItems] = useState<TeaseWithSignedUrl[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [unlockLocal, setUnlockLocal] = useState("");
  const [startBlurred, setStartBlurred] = useState(true);
  const [blurAmount, setBlurAmount] = useState(20);
  const [unlockTaskLabels, setUnlockTaskLabels] = useState<string[]>([""]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [reteasing, setReteasing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [savingReaction, setSavingReaction] = useState<string | null>(null);
  const [reactionDrafts, setReactionDrafts] = useState<Record<string, number>>(
    {}
  );
  const [reactionPrompt, setReactionPrompt] = useState<{
    tease: TeaseWithSignedUrl;
    score: number;
  } | null>(null);
  const [activeView, setActiveView] = useState<{
    tease: TeaseWithSignedUrl;
    url: string;
  } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [revealFrozen, setRevealFrozen] = useState(false);
  const [inlineViewId, setInlineViewId] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const reactionRecorderRef = useRef<TeaseReactionRecorder | null>(null);
  const viewSessionStartedAtRef = useRef(0);

  useEffect(() => {
    return () => {
      reactionRecorderRef.current?.dispose();
      reactionRecorderRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isQueen || !recipient) {
      setRevealFrozen(false);
      return;
    }
    void hasPunishmentEffect("tease_reveal", recipient.id).then(setRevealFrozen);
  }, [isQueen, recipient]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("teases")
      .select(
        "*, unlock_tasks:tease_unlock_tasks(*), view_captures:tease_view_captures(*)"
      )
      .order("created_at", { ascending: false });
    if (isSlave) query = query.eq("sent_to", profile.id);
    const { data } = await query;
    const rows = ((data ?? []) as TeaseWithSignedUrl[]).map((t) => ({
      ...t,
      unlock_tasks: [...(t.unlock_tasks ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      ),
      view_captures: [...(t.view_captures ?? [])].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    }));
    const signed = await withSignedUrls(rows, {
      isQueen: !!isQueen,
      inlineViewId,
    });
    setItems(signed);
    setLoading(false);
  }, [profile, isSlave, isQueen, inlineViewId]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!isQueen) return;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      setRecipient((data as Profile | null) ?? null);
    })();
  }, [isQueen]);

  const setImage = (next: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
    if (next) setStartBlurred(true);
  };

  const createTease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile || !recipient) return;
    const unlocks = unlockLocal ? new Date(unlockLocal) : new Date();
    if (Number.isNaN(unlocks.getTime())) {
      toast.error("Pick a valid unlock time");
      return;
    }
    if (!title.trim() && !message.trim() && !file) {
      toast.error("Add a title, message, or media");
      return;
    }

    const taskLabels = unlockTaskLabels
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (taskLabels.length > 0 && !file) {
      toast.error("Unlock tasks need an image or video to reveal");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    try {
      let imagePath: string | null = null;
      let mediaKind: TeaseMediaKind = "image";
      let geo: Awaited<ReturnType<typeof resolveImageLocation>> = null;
      if (file) {
        mediaKind = isVideoFile(file) ? "video" : "image";
        let uploadFile = file;
        if (mediaKind === "video") {
          const prepared = await prepareVideoForUpload(file);
          uploadFile = prepared.file;
          if (prepared.compressed) {
            toast.message("Video compressed for upload");
          }
        } else {
          geo = await resolveImageLocation(file);
          if (geo) {
            toast.message(
              geo.source === "exif"
                ? "Photo location from image metadata"
                : "Photo location from device GPS"
            );
          }
          uploadFile = await downsizeImageIfNeeded(file);
          if (uploadFile.size < file.size) {
            toast.message(
              `Image compressed to ${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`
            );
          }
        }
        const ext = uploadFile.name.split(".").pop() || (mediaKind === "video" ? "mp4" : "jpg");
        imagePath = await presignAndUpload({
          bucket: "teases",
          file: uploadFile,
          contentType:
            uploadFile.type ||
            (mediaKind === "video" ? "video/mp4" : "image/jpeg"),
          ext,
          relativePath: `${profile.id}/${Date.now()}.${ext}`,
        });
      }

      const taskGated = taskLabels.length > 0;
      const blurred = !!imagePath && (startBlurred || taskGated);
      // Task-gated teases start heavier so each completion visibly clears more
      const startAmount = blurred
        ? taskGated
          ? Math.max(blurAmount || 20, 75)
          : blurAmount || 20
        : 0;

      const { data: created, error } = await supabase
        .from("teases")
        .insert({
          sent_by: profile.id,
          sent_to: recipient.id,
          title: title.trim()
            ? formatRoleSpeech(title.trim(), "queen")
            : null,
          message: message.trim()
            ? formatRoleSpeech(message.trim(), "queen")
            : null,
          image_path: imagePath,
          media_kind: mediaKind,
          unlocks_at: unlocks.toISOString(),
          is_blurred: blurred,
          blur_amount: startAmount,
          unblurred_at: blurred ? null : new Date().toISOString(),
          latitude: geo?.latitude ?? null,
          longitude: geo?.longitude ?? null,
          accuracy_m: geo?.accuracy_m ?? null,
          location_source: geo?.source ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (taskGated && created?.id) {
        const { error: taskError } = await supabase
          .from("tease_unlock_tasks")
          .insert(
            taskLabels.map((label, i) => ({
              tease_id: created.id,
              sort_order: i + 1,
              label,
            }))
          );
        if (taskError) throw taskError;
      }

      if (created?.id && profile) {
        const summary =
          (title.trim()
            ? formatRoleSpeech(title.trim(), "queen")
            : null) ||
          (message.trim()
            ? formatRoleSpeech(message.trim(), "queen")
            : null) ||
          "New tease";
        void import("@/lib/inbox").then(({ postTeaseToInboxes }) =>
          postTeaseToInboxes(supabase, {
            senderId: profile.id,
            teaseId: created.id,
            content: summary,
          })
        );
        void import("@/lib/push-client").then(({ notifyPush }) =>
          notifyPush({
            title: "New tease",
            body: summary,
            url: "/dashboard/inbox",
            target: "slave",
          })
        );
      }

      toast.success(
        taskGated
          ? `Tease queued · ${taskLabels.length} unlock task${taskLabels.length > 1 ? "s" : ""}`
          : blurred
            ? "Blurred tease queued"
            : "Tease queued"
      );
      setTitle("");
      setMessage("");
      setUnlockLocal("");
      setStartBlurred(true);
      setBlurAmount(20);
      setUnlockTaskLabels([""]);
      setImage(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create tease");
    } finally {
      setSubmitting(false);
    }
  };

  const retease = async (tease: TeaseWithSignedUrl) => {
    if (!isQueen || !profile || !recipient) return;
    setReteasing(tease.id);
    const supabase = createClient();
    try {
      const now = new Date().toISOString();
      const labels = (tease.unlock_tasks ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => t.label.trim())
        .filter(Boolean);
      const taskGated = labels.length > 0;
      const blurred = !!tease.image_path && (tease.is_blurred || taskGated);
      const startAmount = blurred
        ? taskGated
          ? Math.max(tease.blur_amount || 20, 75)
          : tease.blur_amount > 0
            ? tease.blur_amount
            : 20
        : 0;

      const { data: created, error } = await supabase
        .from("teases")
        .insert({
          sent_by: profile.id,
          sent_to: recipient.id,
          title: tease.title,
          message: tease.message,
          image_path: tease.image_path,
          media_kind: tease.media_kind ?? "image",
          unlocks_at: now,
          is_blurred: blurred,
          blur_amount: startAmount,
          unblurred_at: blurred ? null : now,
          latitude: tease.latitude,
          longitude: tease.longitude,
          accuracy_m: tease.accuracy_m,
          location_source: tease.location_source,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (taskGated && created?.id) {
        const { error: taskError } = await supabase
          .from("tease_unlock_tasks")
          .insert(
            labels.map((label, i) => ({
              tease_id: created.id,
              sort_order: i + 1,
              label,
            }))
          );
        if (taskError) throw taskError;
      }

      toast.success("Re-teased — sent again");
      if (created?.id && profile) {
        void import("@/lib/inbox").then(({ postTeaseToInboxes }) =>
          postTeaseToInboxes(supabase, {
            senderId: profile.id,
            teaseId: created.id,
            content: tease.title || tease.message || "New tease",
          })
        );
      }
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "New tease",
          body: tease.title || "Queen sent a tease again",
          url: "/dashboard/inbox",
          target: "slave",
        })
      );
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not re-tease");
    } finally {
      setReteasing(null);
    }
  };

  const deleteTease = async (tease: TeaseWithSignedUrl) => {
    if (!isQueen) return;
    setDeleting(tease.id);
    const supabase = createClient();
    const imagePath = tease.image_path;
    const { error } = await supabase.from("teases").delete().eq("id", tease.id);
    if (error) {
      setDeleting(null);
      toast.error(error.message);
      return;
    }

    if (imagePath) {
      const { count } = await supabase
        .from("teases")
        .select("id", { count: "exact", head: true })
        .eq("image_path", imagePath);
      // Re-tease reuses the same path — only remove storage when nothing else points at it
      if (!count) {
        try {
          await removeObject({ bucket: "teases", path: imagePath });
        } catch {
          // Row is gone; orphaned file is acceptable
        }
      }
    }

    if (activeView?.tease.id === tease.id) setActiveView(null);
    setDeleting(null);
    toast.success("Tease deleted");
    void load();
  };

  const setBlurred = async (tease: TeaseWithSignedUrl, blurred: boolean) => {
    if (!isQueen) return;
    if (!blurred && revealFrozen) {
      toast.error("Privilege freeze is active — tease reveal is blocked");
      return;
    }
    setToggling(tease.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("teases")
      .update({
        is_blurred: blurred,
        unblurred_at: blurred ? null : new Date().toISOString(),
        blur_amount: blurred
          ? tease.blur_amount > 0
            ? tease.blur_amount
            : 20
          : 0,
      })
      .eq("id", tease.id);
    setToggling(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(blurred ? "Image blurred again" : "Image revealed");
    if (!blurred) {
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Tease revealed",
          body: tease.title || "Queen revealed a tease",
          url: "/dashboard/teases",
          target: "slave",
        })
      );
    }
    void load();
  };

  const updateBlurAmount = async (tease: TeaseWithSignedUrl, amount: number) => {
    if (!isQueen) return;
    if (amount === 0 && revealFrozen) {
      toast.error("Privilege freeze is active — tease reveal is blocked");
      return;
    }
    setItems((prev) =>
      prev.map((t) =>
        t.id === tease.id
          ? { ...t, blur_amount: amount, is_blurred: amount > 0 }
          : t
      )
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("teases")
      .update({
        blur_amount: amount,
        is_blurred: amount > 0,
        unblurred_at: amount > 0 ? null : new Date().toISOString(),
      })
      .eq("id", tease.id);
    if (error) {
      toast.error(error.message);
      void load();
    }
  };

  const uploadReactionAndCleanup = async (
    teaseId: string,
    watchMetric: number,
    mediaKind: TeaseMediaKind
  ) => {
    const recorder = reactionRecorderRef.current;
    if (!recorder || !profile) return;

    const durationMs = recorder.getDurationMs();
    const mime =
      recorder.getRecordedMime() || pickVideoRecorderMimeType() || "video/webm";
    const blob = await recorder.stopRecording();
    recorder.dispose();
    reactionRecorderRef.current = null;
    setCameraStream(null);

    if (!blob || blob.size === 0) {
      toast.error("Reaction video was empty — try viewing again");
      return;
    }

    try {
      const supabase = createClient();
      await uploadTeaseReactionCapture(supabase, {
        teaseId,
        viewerId: profile.id,
        blob,
        durationMs,
        mime,
        watchMetric,
      });
      await recordTeaseView(supabase, teaseId, watchMetric);
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Reaction video on tease",
          body:
            mediaKind === "video"
              ? `D watched again (+1 view) — reaction cam sent`
              : `D looked ${watchMetric}s — reaction cam sent`,
          url: "/dashboard/teases",
          target: "queen",
        })
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not send reaction video";
      toast.error(msg);
    }
  };

  const startCameraSession = async (): Promise<boolean> => {
    if (!isTeaseReactionCaptureSupported()) {
      toast.error(
        "Camera recording is not supported — use Safari or Chrome on a device with a front camera"
      );
      return false;
    }
    try {
      reactionRecorderRef.current?.dispose();
      reactionRecorderRef.current = null;
      setCameraStream(null);
      const recorder = new TeaseReactionRecorder();
      const stream = await recorder.start();
      reactionRecorderRef.current = recorder;
      setCameraStream(stream);
      return true;
    } catch {
      toast.error("Camera required — allow front camera to view teases");
      return false;
    }
  };

  const endInlineView = async () => {
    if (!inlineViewId) return;
    const id = inlineViewId;
    const tease = items.find((t) => t.id === id);
    const mediaKind = tease?.media_kind ?? "image";
    const watchMetric = teaseWatchMetric(
      mediaKind,
      viewSessionStartedAtRef.current
    );
    setInlineViewId(null);
    await uploadReactionAndCleanup(id, watchMetric, mediaKind);
    if (tease) {
      setReactionPrompt({
        tease,
        score: tease.reaction_score ?? 70,
      });
    }
    void load();
  };

  const beginInlineView = async (tease: TeaseWithSignedUrl) => {
    if (!isSlave || !profile || !tease.image_path) return;
    if (inlineViewId === tease.id) return;
    if (inlineViewId) await endInlineView();

    setOpening(tease.id);
    const ok = await startCameraSession();
    if (!ok) {
      setOpening(null);
      return;
    }

    const now = new Date().toISOString();
    viewSessionStartedAtRef.current = Date.now();
    const supabase = createClient();
    await supabase
      .from("teases")
      .update({
        viewed_at: tease.viewed_at ?? now,
        view_started_at: now,
      })
      .eq("id", tease.id);

    const signedUrl = await signObjectUrl({
      bucket: "teases",
      path: tease.image_path,
      expiresIn: 600,
    });
    if (signedUrl) {
      setItems((prev) =>
        prev.map((t) => (t.id === tease.id ? { ...t, signedUrl } : t))
      );
    }

    setInlineViewId(tease.id);
    setOpening(null);
  };

  const openSessionView = async (tease: TeaseWithSignedUrl) => {
    if (!isSlave || !profile || !tease.image_path) return;
    if (tease.is_blurred || !isTimeUnlocked(tease.unlocks_at)) return;

    setOpening(tease.id);
    if (inlineViewId) await endInlineView();

    const ok = await startCameraSession();
    if (!ok) {
      setOpening(null);
      return;
    }

    const signedUrl = await signObjectUrl({
      bucket: "teases",
      path: tease.image_path,
      expiresIn: 3600,
    });

    if (!signedUrl) {
      setOpening(null);
      reactionRecorderRef.current?.dispose();
      reactionRecorderRef.current = null;
      setCameraStream(null);
      toast.error("Could not open tease");
      return;
    }

    const now = new Date().toISOString();
    viewSessionStartedAtRef.current = Date.now();
    const supabase = createClient();
    await supabase
      .from("teases")
      .update({
        viewed_at: tease.viewed_at ?? now,
        view_started_at: now,
      })
      .eq("id", tease.id);

    setActiveView({ tease, url: signedUrl });
    setOpening(null);
  };

  const endSessionView = async (watchMetric: number) => {
    const current = activeView;
    setActiveView(null);
    if (!current || !isSlave) return;

    const mediaKind = current.tease.media_kind ?? "image";
    await uploadReactionAndCleanup(
      current.tease.id,
      watchMetric,
      mediaKind
    );

    setReactionPrompt({
      tease: current.tease,
      score: current.tease.reaction_score ?? 70,
    });
    void load();
  };

  const saveReaction = async (tease: TeaseWithSignedUrl, score: number) => {
    if (!isSlave) return;
    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    setSavingReaction(tease.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("teases")
      .update({
        reaction_score: clamped,
        reacted_at: new Date().toISOString(),
      })
      .eq("id", tease.id);
    setSavingReaction(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Logged · ${clamped}% wrecked`);
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Tease reaction from D",
        body: `${tease.title || "Tease"} · ${clamped}% wrecked`,
        url: "/dashboard/teases",
        target: "queen",
      })
    );
    setReactionPrompt(null);
    setReactionDrafts((prev) => {
      const next = { ...prev };
      delete next[tease.id];
      return next;
    });
    void load();
  };

  const flagScreenshot = async () => {
    if (!activeView) return;
    const supabase = createClient();
    await supabase
      .from("teases")
      .update({ screenshot_flagged_at: new Date().toISOString() })
      .eq("id", activeView.tease.id)
      .is("screenshot_flagged_at", null);
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-3xl text-ivory">
          <Sparkles className="h-7 w-7 text-gold" />
          Teases
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Blur or reveal — D can watch again until you hide it; each watch sends a reaction cam"
            : "Front camera required every watch — Queen sees how much you like it"}
        </p>
      </div>

      {isQueen && revealFrozen && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          Privilege freeze is active for D — tease reveal is blocked until it
          lifts.
        </div>
      )}

      {isQueen && recipient && (
        <form
          onSubmit={createTease}
          className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-6"
        >
          <h2 className="font-heading text-xl text-gold">Queue a tease</h2>
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
            <Label>Image or video (optional)</Label>
            {preview ? (
              <div className="relative overflow-hidden rounded-lg border border-gold/20">
                {file && isVideoFile(file) ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    src={preview}
                    controls
                    playsInline
                    className="max-h-64 w-full bg-void object-contain transition"
                    style={
                      startBlurred ||
                      unlockTaskLabels.some((l) => l.trim().length > 0)
                        ? blurStyle(blurAmount)
                        : undefined
                    }
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="Preview"
                    className="max-h-64 w-full object-contain bg-void transition"
                    style={
                      startBlurred ||
                      unlockTaskLabels.some((l) => l.trim().length > 0)
                        ? blurStyle(blurAmount)
                        : undefined
                    }
                  />
                )}
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="absolute right-2 top-2 rounded-full bg-void/80 p-1.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-gold/25 px-4 py-8 hover:border-gold/50">
                <ImagePlus className="h-7 w-7 text-gold/70" />
                <span className="text-sm text-muted-foreground">
                  Drop or choose an image or video
                </span>
                <input
                  type="file"
                  accept={ACCEPTED_MEDIA.join(",")}
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && ACCEPTED_MEDIA.includes(f.type)) setImage(f);
                  }}
                />
              </label>
            )}
            {file && isVideoFile(file) && (
              <p className="text-xs text-muted-foreground">
                Blurred or revealed — D can watch again anytime until you blur
                it again. Each watch sends Queen a reaction video.
              </p>
            )}
          </div>
          {file && (
            <div className="space-y-3 rounded-lg border border-gold/15 bg-void/40 p-4">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={
                    startBlurred ||
                    unlockTaskLabels.some((l) => l.trim().length > 0)
                  }
                  disabled={unlockTaskLabels.some((l) => l.trim().length > 0)}
                  onChange={(e) => setStartBlurred(e.target.checked)}
                  className="size-4 accent-[var(--gold,#d4af37)]"
                />
                <span className="text-sm text-ivory">
                  Start blurred — control how much D can see
                  {unlockTaskLabels.some((l) => l.trim().length > 0)
                    ? " (required with unlock tasks)"
                    : ""}
                </span>
              </label>
              {(startBlurred ||
                unlockTaskLabels.some((l) => l.trim().length > 0)) && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-end justify-between gap-3">
                    <Label className="text-ivory/80">Blur for D</Label>
                    <p className="text-sm text-gold">
                      {blurAmount}% · {blurLabel(blurAmount)}
                    </p>
                  </div>
                  <Slider
                    value={[blurAmount]}
                    onValueChange={(v) => setBlurAmount(v[0] ?? 20)}
                    min={0}
                    max={100}
                    step={1}
                    aria-label="Blur amount"
                    className="py-2 **:data-[slot=slider-range]:bg-gold **:data-[slot=slider-thumb]:border-gold **:data-[slot=slider-thumb]:bg-gold"
                  />
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Clear</span>
                    <span>Opaque</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="space-y-3 rounded-lg border border-gold/15 bg-void/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-ivory">Unlock tasks (optional)</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                  1–3 tasks — each one eases the blur; all done = fully clear
                  (needs an image)
                </p>
              </div>
              {unlockTaskLabels.length < 3 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setUnlockTaskLabels((prev) => [...prev, ""])
                  }
                  className="text-gold hover:bg-gold/10 hover:text-gold"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {unlockTaskLabels.map((label, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-xs text-muted-foreground">
                    {idx + 1}.
                  </span>
                  <Input
                    value={label}
                    onChange={(e) =>
                      setUnlockTaskLabels((prev) =>
                        prev.map((v, i) => (i === idx ? e.target.value : v))
                      )
                    }
                    placeholder={
                      idx === 0
                        ? "e.g. Edge for 5 minutes without finishing"
                        : "Another task…"
                    }
                    className="border-gold/20 bg-void/60"
                  />
                  {unlockTaskLabels.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setUnlockTaskLabels((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-void hover:text-ivory"
                      aria-label="Remove task"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {unlockTaskLabels.every((l) => !l.trim()) ? (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ListPlus className="h-3.5 w-3.5" />
                Leave empty to use blur / manual reveal only
              </p>
            ) : !file ? (
              <p className="text-[11px] text-gold/90">
                Add an image above — tasks unlock that picture
              </p>
            ) : null}
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <EyeOff className="mr-2 h-4 w-4" />
            )}
            Queue tease
          </Button>
        </form>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teases yet.</p>
        ) : (
          items.map((t) => {
            const timeReady = isTimeUnlocked(t.unlocks_at);
            const showImage = isQueen || timeReady;
            const visuallyBlurred = !!t.image_path && t.is_blurred;
            const amount = t.blur_amount ?? 20;
            const fullyRevealed = showImage && !visuallyBlurred;
            const isVideo = t.media_kind === "video";
            const slaveNeedsSessionView =
              isSlave && fullyRevealed && !!t.image_path;
            const unlockTasks = t.unlock_tasks ?? [];
            const hasUnlockTasks = unlockTasks.length > 0;
            const tasksDone = unlockTasks.filter((x) => x.completed_at).length;
            const tasksAllDone =
              hasUnlockTasks && tasksDone === unlockTasks.length;

            return (
              <article
                key={t.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-charcoal/80",
                  fullyRevealed ? "border-gold/30" : "border-gold/15"
                )}
              >
                <div className="relative aspect-[4/5] bg-void overflow-hidden select-none">
                  {!showImage ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                      <Lock className="h-8 w-8 text-gold/50" />
                      <p className="font-heading text-ivory">
                        {t.title || "Locked tease"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Available {formatDeadline(t.unlocks_at)}
                      </p>
                    </div>
                  ) : isSlave && visuallyBlurred && inlineViewId !== t.id ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                      <Video className="h-8 w-8 text-gold" />
                      <p className="font-heading text-ivory">Camera required</p>
                      <p className="text-xs text-muted-foreground">
                        Queen receives a short reaction video while you view
                      </p>
                      <Button
                        size="sm"
                        disabled={opening === t.id}
                        onClick={() => void beginInlineView(t)}
                        className="bg-gold text-void hover:bg-gold-muted"
                      >
                        {opening === t.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Video className="mr-2 h-3.5 w-3.5" />
                        )}
                        View tease
                      </Button>
                    </div>
                  ) : t.signedUrl &&
                    (isQueen ||
                      (isSlave && visuallyBlurred && inlineViewId === t.id)) ? (
                    <>
                      {isVideo ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video
                          src={t.signedUrl}
                          controls
                          playsInline
                          className="absolute inset-0 h-full w-full object-cover transition duration-500"
                          style={
                            visuallyBlurred ? blurStyle(amount) : undefined
                          }
                          controlsList="nodownload"
                        />
                      ) : (
                        <Image
                          src={t.signedUrl}
                          alt={t.title || "Tease"}
                          fill
                          unoptimized
                          className="object-cover transition duration-500"
                          style={
                            visuallyBlurred ? blurStyle(amount) : undefined
                          }
                          sizes="50vw"
                        />
                      )}
                      {isSlave && inlineViewId === t.id && cameraStream && (
                        <TeaseReactionCameraPip
                          stream={cameraStream}
                          className="absolute right-2 top-2 z-10 h-20 w-16 sm:h-24 sm:w-20"
                        />
                      )}
                      {isSlave && inlineViewId === t.id && (
                        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-void via-void/90 to-transparent p-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full border-gold/40 text-gold hover:bg-gold/10"
                            onClick={() => void endInlineView()}
                          >
                            End view
                          </Button>
                        </div>
                      )}
                      {visuallyBlurred && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-void/80 to-transparent p-3 text-center">
                          <p className="text-xs text-ivory/90">
                            {isQueen
                              ? `${amount}% blur for D · ${blurLabel(amount)}${isVideo ? " · video" : ""}`
                              : hasUnlockTasks && !tasksAllDone
                                ? `${tasksDone}/${unlockTasks.length} · ${amount}% blur`
                                : isVideo
                                  ? "Veiled video · waiting for Queen to reveal"
                                  : "Waiting for Queen to reveal"}
                          </p>
                        </div>
                      )}
                    </>
                  ) : slaveNeedsSessionView ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                      <Eye className="h-8 w-8 text-gold" />
                      <p className="font-heading text-ivory">
                        {t.title || "Ready to view"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Front camera required · reaction for Queen each watch
                      </p>
                      <Button
                        size="sm"
                        disabled={opening === t.id}
                        onClick={() => void openSessionView(t)}
                        className="bg-gold text-void hover:bg-gold-muted"
                      >
                        {opening === t.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="mr-2 h-3.5 w-3.5" />
                        )}
                        {isVideo ? "Watch tease" : "View tease"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center p-4">
                      <Sparkles className="h-8 w-8 text-gold/40" />
                    </div>
                  )}
                </div>

                <div className="space-y-3 p-4">
                  <div className="space-y-1">
                    <p className="font-heading text-ivory">
                      <RoleSpeech text={t.title || "Tease"} role="queen" />
                    </p>
                    <GeoMapLinks
                      latitude={t.latitude}
                      longitude={t.longitude}
                      accuracy_m={t.accuracy_m}
                      location_source={t.location_source}
                    />
                    {(isQueen || fullyRevealed) && t.message && (
                      <p className="whitespace-pre-wrap text-sm text-ivory/80">
                        <RoleSpeech text={t.message} role="queen" />
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {visuallyBlurred
                        ? hasUnlockTasks && !tasksAllDone
                          ? `Tasks · ${tasksDone}/${unlockTasks.length}`
                          : "Blurred"
                        : t.unblurred_at
                          ? `Revealed ${formatRelative(t.unblurred_at)}`
                          : timeReady
                            ? `Available ${formatRelative(t.unlocks_at)}`
                            : `Available ${formatDeadline(t.unlocks_at)}`}
                      {t.screenshot_flagged_at ? " · capture alert" : ""}
                      {isQueen && (t.view_count ?? 0) > 0
                        ? ` · ${formatTeaseViewCount(t.view_count ?? 0, t.media_kind ?? "image")}`
                        : t.viewed_at
                          ? " · viewed"
                          : ""}
                    </p>
                  </div>

                  {isQueen && (t.view_count ?? 0) > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-gold/20 bg-void/50 px-3 py-2 text-sm text-ivory">
                      <BarChart3 className="h-4 w-4 text-gold" />
                      <span>
                        D&apos;s attention ·{" "}
                        <span className="font-heading text-gold">
                          {formatTeaseViewCount(
                            t.view_count ?? 0,
                            t.media_kind ?? "image"
                          )}
                        </span>
                      </span>
                      {(t.view_captures?.length ?? 0) > 0 && (
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {t.view_captures?.length} reaction
                          {(t.view_captures?.length ?? 0) === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  )}

                  {isQueen && t.reaction_score != null && (
                    <div className="flex items-center gap-2 rounded-lg border border-gold/20 bg-void/50 px-3 py-2 text-sm text-ivory">
                      <Flame className="h-4 w-4 text-gold" />
                      <span>
                        D wrecked ·{" "}
                        <span className="font-heading text-gold">
                          {t.reaction_score}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {wreckedLabel(t.reaction_score)}
                        </span>
                      </span>
                      {t.reacted_at && (
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {formatRelative(t.reacted_at)}
                        </span>
                      )}
                    </div>
                  )}

                  {isQueen && t.reaction_score == null && (
                    <p className="text-xs text-muted-foreground">
                      Waiting for D’s wrecked score
                    </p>
                  )}

                  {isQueen && t.view_captures?.[0] && (
                    <TeaseViewCapturePlayer capture={t.view_captures[0]} />
                  )}

                  {isSlave && (
                    <div className="space-y-2 rounded-lg border border-gold/15 bg-void/40 p-3">
                      <div className="flex items-end justify-between gap-2">
                        <Label className="flex items-center gap-1.5 text-xs">
                          <Flame className="h-3.5 w-3.5 text-gold" />
                          How wrecked
                        </Label>
                        <span className="font-heading text-lg text-gold">
                          {reactionDrafts[t.id] ?? t.reaction_score ?? 70}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {wreckedLabel(
                          reactionDrafts[t.id] ?? t.reaction_score ?? 70
                        )}
                        {t.is_blurred ? " · even while veiled" : ""}
                      </p>
                      <Slider
                        value={[reactionDrafts[t.id] ?? t.reaction_score ?? 70]}
                        onValueChange={(v) =>
                          setReactionDrafts((prev) => ({
                            ...prev,
                            [t.id]: v[0] ?? 70,
                          }))
                        }
                        min={0}
                        max={100}
                        step={1}
                        aria-label="How wrecked"
                        className="py-1 **:data-[slot=slider-range]:bg-gold **:data-[slot=slider-thumb]:border-gold **:data-[slot=slider-thumb]:bg-gold"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingReaction === t.id}
                        onClick={() =>
                          void saveReaction(
                            t,
                            reactionDrafts[t.id] ?? t.reaction_score ?? 70
                          )
                        }
                        className="bg-gold text-void hover:bg-gold-muted"
                      >
                        {savingReaction === t.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Flame className="mr-2 h-3.5 w-3.5" />
                        )}
                        {t.reaction_score != null
                          ? "Update score"
                          : "Submit score"}
                      </Button>
                    </div>
                  )}

                  {hasUnlockTasks && (
                    <TeaseUnlockChecklist
                      tasks={unlockTasks}
                      canComplete={!!isSlave}
                      timeReady={timeReady}
                      onChanged={() => void load()}
                    />
                  )}

                  {isQueen && t.image_path && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-end justify-between gap-2">
                          <Label className="text-xs text-muted-foreground">
                            Blur for D
                          </Label>
                          <span className="text-xs text-gold">
                            {amount}% · {blurLabel(amount)}
                          </span>
                        </div>
                        <Slider
                          value={[amount]}
                          onValueChange={(v) => {
                            const next = v[0] ?? 0;
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === t.id
                                  ? {
                                      ...x,
                                      blur_amount: next,
                                      is_blurred: next > 0,
                                    }
                                  : x
                              )
                            );
                          }}
                          onValueCommit={(v) =>
                            void updateBlurAmount(t, v[0] ?? 0)
                          }
                          min={0}
                          max={100}
                          step={1}
                          aria-label="Blur amount"
                          className="py-1 **:data-[slot=slider-range]:bg-gold **:data-[slot=slider-thumb]:border-gold **:data-[slot=slider-thumb]:bg-gold"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          toggling === t.id ||
                          (t.is_blurred && revealFrozen)
                        }
                        onClick={() => void setBlurred(t, !t.is_blurred)}
                        className={
                          t.is_blurred
                            ? "bg-gold text-void hover:bg-gold-muted"
                            : "border border-muted bg-transparent text-ivory hover:bg-void/60"
                        }
                      >
                        {toggling === t.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : t.is_blurred ? (
                          <Eye className="mr-2 h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="mr-2 h-3.5 w-3.5" />
                        )}
                        {t.is_blurred ? "Reveal fully" : "Blur again"}
                      </Button>
                      <KeepInEvidenceButton
                        sourceType="tease"
                        sourceId={t.id}
                        mediaKind={isVideo ? "video" : "image"}
                        title={
                          t.title
                            ? `Tease · ${t.title}`
                            : isVideo
                              ? "Tease video"
                              : "Tease image"
                        }
                        caption={t.message}
                        filePath={t.image_path}
                        storageBucket="teases"
                        label={isVideo ? "Keep video" : "Keep image"}
                      />
                    </div>
                  )}

                  {isQueen && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={reteasing === t.id || deleting === t.id}
                        onClick={() => void retease(t)}
                        className="border-gold/40 text-gold hover:bg-gold/10"
                      >
                        {reteasing === t.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Repeat2 className="mr-2 h-3.5 w-3.5" />
                        )}
                        Re-tease
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={deleting === t.id || reteasing === t.id}
                        onClick={() => void deleteTease(t)}
                        className="text-muted-foreground hover:text-red-300"
                        aria-label="Delete tease"
                      >
                        {deleting === t.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                        )}
                        Delete
                      </Button>
                    </div>
                  )}

                  <LazyTeaseThread
                    teaseId={t.id}
                    teaseTitle={t.title}
                  />
                </div>
              </article>
            );
          })
        )}
      </section>

      {activeView && profile && (
        <TeaseSessionViewer
          mediaUrl={activeView.url}
          mediaKind={activeView.tease.media_kind ?? "image"}
          title={activeView.tease.title}
          cameraStream={cameraStream}
          onSessionEnd={({ watchMetric }) => void endSessionView(watchMetric)}
          onSuspiciousCapture={() => void flagScreenshot()}
        />
      )}

      {reactionPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-void/80 p-4 sm:items-center">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-gold/25 bg-charcoal p-5 shadow-xl">
            <div className="space-y-1">
              <p className="font-heading text-xl text-ivory">How wrecked?</p>
              <p className="text-sm text-muted-foreground">
                {reactionPrompt.tease.title
                  ? `Rate “${reactionPrompt.tease.title}” for Queen`
                  : "Rate this tease for Queen"}
              </p>
            </div>
            <div className="flex items-end justify-between gap-2">
              <Label className="flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-gold" />
                Wrecked
              </Label>
              <span className="font-heading text-2xl text-gold">
                {reactionPrompt.score}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {wreckedLabel(reactionPrompt.score)}
            </p>
            <Slider
              value={[reactionPrompt.score]}
              onValueChange={(v) =>
                setReactionPrompt((prev) =>
                  prev ? { ...prev, score: v[0] ?? 70 } : prev
                )
              }
              min={0}
              max={100}
              step={1}
              aria-label="How wrecked"
              className="py-2 **:data-[slot=slider-range]:bg-gold **:data-[slot=slider-thumb]:border-gold **:data-[slot=slider-thumb]:bg-gold"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1 bg-gold text-void hover:bg-gold-muted"
                disabled={savingReaction === reactionPrompt.tease.id}
                onClick={() =>
                  void saveReaction(reactionPrompt.tease, reactionPrompt.score)
                }
              >
                {savingReaction === reactionPrompt.tease.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Flame className="mr-2 h-4 w-4" />
                )}
                Send to Queen
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={savingReaction === reactionPrompt.tease.id}
                onClick={() => setReactionPrompt(null)}
                className="text-muted-foreground"
              >
                Later
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
