"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  ImagePlus,
  Loader2,
  Link2,
  MapPin,
  Send,
  Trash2,
  Video,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { getYouTubeEmbedUrl, isValidYouTubeUrl } from "@/lib/youtube";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { hasPunishmentEffect } from "@/lib/punishments";
import { getCurrentPosition, resolveImageLocation } from "@/lib/location";
import { formatRoleSpeech } from "@/lib/role-speech";
import type { DatePost, DatePostMediaKind, DatePostWithSignedUrl, Profile } from "@/lib/types";
import { KeepInEvidenceButton } from "@/components/evidence/keep-in-evidence-button";
import { GeoMapLinks } from "@/components/location/geo-map-links";
import { RoleSpeech } from "@/components/ui/role-speech";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { presignAndUpload, removeObject, signObjectUrl } from "@/lib/storage/client";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

type Props = {
  dateId: string;
  dateTitle?: string | null;
  canPost: boolean;
  onPosted?: () => void;
};

type DatePostRow = DatePostWithSignedUrl & {
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

async function withSignedUrls(
  posts: DatePostRow[]
): Promise<DatePostRow[]> {
  return Promise.all(
    posts.map(async (p) => {
      if (!p.file_path) return p;
      const signedUrl =
        (await signObjectUrl({
          bucket: "date_posts",
          path: p.file_path,
        })) ?? undefined;
      return { ...p, signedUrl };
    })
  );
}

export function DateTimeline({
  dateId,
  dateTitle,
  canPost,
  onPosted,
}: Props) {
  const { profile, isQueen } = useAuth();
  const [posts, setPosts] = useState<DatePostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [youtube, setYoutube] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingLocation, setSendingLocation] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dateTimeout, setDateTimeout] = useState(false);

  const allowPost = canPost && !dateTimeout;

  useEffect(() => {
    // Date timeout only blocks the slave, never Queen
    if (!canPost || !profile || isQueen) {
      setDateTimeout(false);
      return;
    }
    void hasPunishmentEffect("date_post", profile.id).then(setDateTimeout);
  }, [canPost, profile, isQueen]);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("date_posts")
      .select("*, author:users!author_id(id, username, role)")
      .eq("date_id", dateId)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const signed = await withSignedUrls((data ?? []) as DatePostRow[]);
    setPosts(signed);
    setLoading(false);
  }, [dateId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`date-posts:${dateId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "date_posts",
          filter: `date_id=eq.${dateId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [dateId, load]);

  const clearMedia = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
  };

  const pickFile = (f: File | null) => {
    clearMedia();
    if (!f) return;
    const isImage = IMAGE_TYPES.includes(f.type);
    const isVideo = VIDEO_TYPES.includes(f.type);
    if (!isImage && !isVideo) {
      toast.error("Use an image or video file");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setYoutube("");
  };

  const sendLocation = async () => {
    if (!allowPost || !profile) return;
    if (dateTimeout) {
      toast.error("Date timeout is active — posting is blocked");
      return;
    }

    setSendingLocation(true);
    const supabase = createClient();
    try {
      const geo = await getCurrentPosition();
      const text = formatRoleSpeech(
        body.trim() || "Shared location",
        profile.role
      );
      const { error } = await supabase.from("date_posts").insert({
        date_id: dateId,
        author_id: profile.id,
        body: text,
        media_kind: "text",
        file_path: null,
        youtube_url: null,
        latitude: geo.latitude,
        longitude: geo.longitude,
        accuracy_m: geo.accuracy_m,
        location_source: geo.source,
      });
      if (error) throw error;

      toast.success("Location shared on timeline");
      setBody("");
      void load();
      onPosted?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not share location";
      toast.error(msg);
    } finally {
      setSendingLocation(false);
    }
  };

  const publish = async () => {
    if (!allowPost || !profile) return;
    if (dateTimeout) {
      toast.error("Date timeout is active — posting is blocked");
      return;
    }
    const text = body.trim();
    const yt = youtube.trim();
    if (!text && !file && !yt) {
      toast.error("Write something, attach media, or add a YouTube link");
      return;
    }
    if (yt && !isValidYouTubeUrl(yt)) {
      toast.error("Enter a valid YouTube URL");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    try {
      let mediaKind: DatePostMediaKind = "text";
      let filePath: string | null = null;
      let youtubeUrl: string | null = null;
      const speechBody = text
        ? formatRoleSpeech(text, profile.role)
        : null;

      if (file) {
        const isVideo = VIDEO_TYPES.includes(file.type);
        let geo: Awaited<ReturnType<typeof resolveImageLocation>> = null;
        if (!isVideo) {
          // Read EXIF / device GPS from the original file before compression
          geo = await resolveImageLocation(file);
          if (geo) {
            toast.message(
              geo.source === "exif"
                ? "Photo location from image metadata"
                : "Photo location from device GPS"
            );
          }
        }
        let uploadFile = file;
        if (!isVideo) {
          uploadFile = await downsizeImageIfNeeded(file);
          if (uploadFile.size < file.size) {
            toast.message(
              `Photo compressed to ${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`
            );
          }
        }
        mediaKind = isVideo ? "video" : "image";
        const ext = uploadFile.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
        filePath = await presignAndUpload({
          bucket: "date_posts",
          file: uploadFile,
          contentType: uploadFile.type || (isVideo ? "video/mp4" : "image/jpeg"),
          ext,
          relativePath: `${profile.id}/${dateId}/${Date.now()}.${ext}`,
        });

        const { error } = await supabase.from("date_posts").insert({
          date_id: dateId,
          author_id: profile.id,
          body: speechBody,
          media_kind: mediaKind,
          file_path: filePath,
          youtube_url: null,
          latitude: geo?.latitude ?? null,
          longitude: geo?.longitude ?? null,
          accuracy_m: geo?.accuracy_m ?? null,
          location_source: geo?.source ?? null,
        });
        if (error) throw error;
      } else if (yt) {
        mediaKind = "youtube";
        youtubeUrl = yt;
        const { error } = await supabase.from("date_posts").insert({
          date_id: dateId,
          author_id: profile.id,
          body: speechBody,
          media_kind: mediaKind,
          file_path: null,
          youtube_url: youtubeUrl,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("date_posts").insert({
          date_id: dateId,
          author_id: profile.id,
          body: speechBody,
          media_kind: "text",
          file_path: null,
          youtube_url: null,
        });
        if (error) throw error;
      }

      toast.success("Posted to timeline");
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: isQueen ? "Queen posted on a date" : "New date timeline post",
          body: dateTitle || text.slice(0, 80) || "New timeline post",
          url: "/dashboard/dates",
          target: isQueen ? "slave" : "queen",
        })
      );
      setBody("");
      setYoutube("");
      clearMedia();
      void load();
      onPosted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (post: DatePostRow) => {
    if (!profile) return;
    if (post.author_id !== profile.id && !isQueen) return;
    setDeleting(post.id);
    const supabase = createClient();
    if (post.file_path) {
      await removeObject({ bucket: "date_posts", path: post.file_path });
    }
    const { error } = await supabase
      .from("date_posts")
      .delete()
      .eq("id", post.id);
    setDeleting(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Post removed");
    void load();
  };

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gold/90">
        Timeline
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading posts…</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {allowPost
            ? "No posts yet — share thoughts, photos, videos, location, or a YouTube link."
            : dateTimeout
              ? "Date timeout active — you can view but not post."
              : "No timeline posts yet."}
        </p>
      ) : (
        <ol className="relative space-y-4 border-l border-gold/20 pl-4">
          {posts.map((post) => {
            const embed =
              post.youtube_url && isValidYouTubeUrl(post.youtube_url)
                ? getYouTubeEmbedUrl(post.youtube_url)
                : null;
            const canDelete =
              profile?.id === post.author_id || !!isQueen;

            return (
              <li key={post.id} className="relative space-y-2">
                <span className="absolute -left-[1.35rem] top-1.5 size-2.5 rounded-full bg-gold" />
                <div className="rounded-lg border border-gold/10 bg-void/50 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      <span
                        className={
                          post.author?.role === "queen"
                            ? "text-gold"
                            : "text-ivory/70"
                        }
                      >
                        {post.author?.username ?? "Someone"}
                        {post.author?.role === "queen" ? " · Queen" : ""}
                      </span>
                      {" · "}
                      {formatRelative(post.created_at)}
                      {post.media_kind !== "text" ? ` · ${post.media_kind}` : ""}
                    </p>
                    <div className="flex items-center gap-1">
                      {isQueen && (
                        <KeepInEvidenceButton
                          sourceType="date_post"
                          sourceId={post.id}
                          mediaKind={
                            post.media_kind === "text"
                              ? "text"
                              : post.media_kind
                          }
                          title={
                            dateTitle
                              ? `Date · ${dateTitle}`
                              : "Date timeline"
                          }
                          caption={post.body}
                          youtubeUrl={post.youtube_url}
                          filePath={post.file_path}
                          storageBucket={
                            post.file_path ? "date_posts" : null
                          }
                          label="Keep"
                          className="h-7 px-2 text-[11px]"
                        />
                      )}
                      {canDelete && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={deleting === post.id}
                          className="size-7 text-muted-foreground hover:text-red-300"
                          onClick={() => void remove(post)}
                          aria-label="Delete post"
                        >
                          {deleting === post.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {post.body && (
                    <p className="whitespace-pre-wrap text-sm text-ivory/90">
                      <RoleSpeech
                        text={post.body}
                        role={post.author?.role}
                      />
                    </p>
                  )}

                  {post.media_kind === "image" && post.signedUrl && (
                    <div className="relative aspect-[4/5] max-h-80 overflow-hidden rounded-md border border-gold/15">
                      <Image
                        src={post.signedUrl}
                        alt="Timeline photo"
                        fill
                        unoptimized
                        className="object-cover"
                        sizes="400px"
                      />
                    </div>
                  )}

                  {post.latitude != null &&
                    post.longitude != null &&
                    Number.isFinite(post.latitude) &&
                    Number.isFinite(post.longitude) && (
                      <GeoMapLinks
                        latitude={post.latitude}
                        longitude={post.longitude}
                        accuracy_m={post.accuracy_m}
                        location_source={post.location_source}
                      />
                    )}

                  {post.media_kind === "video" && post.signedUrl && (
                    <video
                      src={post.signedUrl}
                      controls
                      playsInline
                      className="max-h-80 w-full rounded-md border border-gold/15 bg-black"
                    />
                  )}

                  {embed && (
                    <div className="aspect-video overflow-hidden rounded-md border border-gold/15">
                      <iframe
                        src={embed}
                        title="YouTube"
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {dateTimeout && canPost && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          Date timeout is active. You can read the timeline but cannot post.
        </div>
      )}

      {allowPost && (
        <div className="space-y-3 rounded-lg border border-gold/15 bg-void/40 p-3">
          <div className="space-y-2">
            <Label>New post</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder={
                isQueen
                  ? "Tease D… share a photo, note, or update from the date…"
                  : "What’s happening… how you feel…"
              }
              className="border-gold/20 bg-void/60"
            />
          </div>

          {preview && file ? (
            <div className="relative overflow-hidden rounded-md border border-gold/15">
              {VIDEO_TYPES.includes(file.type) ? (
                <video
                  src={preview}
                  controls
                  className="max-h-48 w-full bg-black"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-48 w-full object-contain bg-void"
                />
              )}
              <button
                type="button"
                onClick={clearMedia}
                className="absolute right-2 top-2 rounded-full bg-void/80 p-1.5 text-ivory"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <label
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gold/20 px-3 py-1.5 text-xs text-ivory hover:border-gold/40"
                )}
              >
                <ImagePlus className="h-3.5 w-3.5 text-gold" />
                Photo
                <input
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gold/20 px-3 py-1.5 text-xs text-ivory hover:border-gold/40">
                <Video className="h-3.5 w-3.5 text-gold" />
                Video
                <input
                  type="file"
                  accept={VIDEO_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                disabled={submitting || sendingLocation}
                onClick={() => void sendLocation()}
                className="inline-flex items-center gap-1.5 rounded-md border border-gold/20 px-3 py-1.5 text-xs text-ivory hover:border-gold/40 disabled:opacity-50"
              >
                {sendingLocation ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 text-gold" />
                )}
                Location
              </button>
            </div>
          )}

          {!file && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" />
                YouTube URL (optional)
              </Label>
              <Input
                value={youtube}
                onChange={(e) => {
                  setYoutube(e.target.value);
                  if (e.target.value.trim()) clearMedia();
                }}
                placeholder="https://youtube.com/watch?v=…"
                className="border-gold/20 bg-void/60"
              />
            </div>
          )}

          <Button
            type="button"
            disabled={submitting || sendingLocation}
            onClick={() => void publish()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Post to timeline
          </Button>
        </div>
      )}
    </div>
  );
}
