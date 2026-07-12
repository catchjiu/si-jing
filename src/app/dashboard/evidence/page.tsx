"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bookmark, Flame, HeartCrack, Images, Mic } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { unpinEvidence } from "@/lib/evidence-pins";
import type { EvidencePin } from "@/lib/types";
import { isStorageBucket } from "@/lib/storage/paths";
import { signObjectUrl } from "@/lib/storage/client";
import { VoicePlayer } from "@/components/voice/voice-player";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type EvidenceItem = {
  id: string;
  kind: "submission" | "pin";
  media_type: string;
  file_path: string | null;
  youtube_url: string | null;
  uploaded_at: string;
  title: string;
  subtitle?: string;
  submission_id?: string;
  task_id?: string;
  signedUrl?: string;
  storage_bucket?: string | null;
  meta?: Record<string, unknown> | null;
  pin?: EvidencePin;
};

type Filter = "this_week" | "last_week" | "all" | "pinned" | string;

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function youtubeId(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

export default function EvidencePage() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("this_week");
  const [active, setActive] = useState<EvidenceItem | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const supabase = createClient();

      let submissionsQuery = supabase
        .from("submissions")
        .select("id, task_id, submitted_by, task:tasks(id, title)");

      if (isSlave) {
        submissionsQuery = submissionsQuery.eq("submitted_by", profile.id);
      }

      const [{ data: submissions }, { data: pins }] = await Promise.all([
        submissionsQuery,
        supabase
          .from("evidence_pins")
          .select("*")
          .order("pinned_at", { ascending: false }),
      ]);

      const subs = (submissions ?? []) as {
        id: string;
        task_id: string;
        submitted_by: string;
        task: { id: string; title: string } | null;
      }[];

      const softSign = async (
        bucket: string,
        path: string | null
      ): Promise<string | undefined> => {
        if (!path || !isStorageBucket(bucket)) return undefined;
        try {
          return (
            (await signObjectUrl({ bucket, path })) ?? undefined
          );
        } catch {
          return undefined;
        }
      };

      const mapped: EvidenceItem[] = [];

      if (subs.length > 0) {
        const { data: media } = await supabase
          .from("submission_media")
          .select("*")
          .in(
            "submission_id",
            subs.map((s) => s.id)
          )
          .order("uploaded_at", { ascending: false });

        const bySub = new Map(subs.map((s) => [s.id, s]));
        const mediaRows = (media ?? []) as {
          id: string;
          media_type: string;
          file_path: string | null;
          youtube_url: string | null;
          uploaded_at: string;
          submission_id: string;
        }[];

        const signedSubs = await Promise.all(
          mediaRows.map(async (m) => {
            const sub = bySub.get(m.submission_id);
            const signedUrl = await softSign("submissions", m.file_path);
            return {
              id: `sub-${m.id}`,
              kind: "submission" as const,
              media_type: m.media_type,
              file_path: m.file_path,
              youtube_url: m.youtube_url,
              uploaded_at: m.uploaded_at,
              title: sub?.task?.title ?? "Task",
              subtitle: "Task submission",
              submission_id: m.submission_id,
              task_id: sub?.task_id ?? "",
              signedUrl,
              storage_bucket: "submissions",
            } satisfies EvidenceItem;
          })
        );
        mapped.push(...signedSubs);
      }

      const pinRows = (pins ?? []) as EvidencePin[];
      const signedPins = await Promise.all(
        pinRows.map(async (p) => {
          const signedUrl = await softSign(
            p.storage_bucket ?? "",
            p.file_path
          );
          return {
            id: `pin-${p.id}`,
            kind: "pin" as const,
            media_type: p.media_kind,
            file_path: p.file_path,
            youtube_url: p.youtube_url,
            uploaded_at: p.pinned_at,
            title: p.title,
            subtitle:
              p.source_type === "date"
                ? "Pinned from Date"
                : p.source_type === "date_post"
                  ? "Pinned from Date timeline"
                  : p.source_type === "tease"
                    ? "Pinned from Tease"
                    : "Pinned voice",
            signedUrl,
            storage_bucket: p.storage_bucket,
            meta: p.meta,
            pin: p,
          } satisfies EvidenceItem;
        })
      );
      mapped.push(...signedPins);

      mapped.sort(
        (a, b) =>
          new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
      );

      setItems(mapped);
    } catch (err) {
      console.error("Evidence load failed", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to load evidence"
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const taskOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) {
      if (i.task_id) map.set(i.task_id, i.title);
    }
    return Array.from(map.entries());
  }, [items]);

  const filtered = useMemo(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    return items.filter((i) => {
      if (filter === "pinned") return i.kind === "pin";
      const d = new Date(i.uploaded_at);
      if (filter === "this_week") return d >= thisWeekStart;
      if (filter === "last_week") return d >= lastWeekStart && d < thisWeekStart;
      if (filter === "all") return true;
      return i.task_id === filter;
    });
  }, [items, filter]);

  const removePin = async (item: EvidenceItem) => {
    if (!item.pin || !isQueen) return;
    const { error } = await unpinEvidence(item.pin.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed from Evidence");
    setActive(null);
    void load();
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!isQueen && !isSlave) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-3xl text-ivory">
          <Images className="h-7 w-7 text-gold" />
          Evidence
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Task submissions plus moments you keep from Dates and Teases"
            : "Your submitted evidence and moments Queen kept"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["this_week", "This week"],
            ["last_week", "Last week"],
            ["pinned", "Kept"],
            ["all", "All"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={filter === id ? "default" : "outline"}
            className={
              filter === id
                ? "bg-gold text-void hover:bg-gold-muted"
                : "border-muted"
            }
            onClick={() => setFilter(id)}
          >
            {label}
          </Button>
        ))}
        {taskOptions.map(([id, title]) => (
          <Button
            key={id}
            size="sm"
            variant={filter === id ? "default" : "outline"}
            className={
              filter === id
                ? "bg-gold text-void hover:bg-gold-muted"
                : "border-muted"
            }
            onClick={() => setFilter(id)}
          >
            {title}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No evidence in this view.</p>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((item) => {
            const yt = item.youtube_url
              ? youtubeId(item.youtube_url)
              : null;
            const isReaction = item.media_type === "reaction";
            const isVoice = item.media_type === "voice";
            const isVideo = item.media_type === "video";
            const isText = item.media_type === "text";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item)}
                className={cn(
                  "group overflow-hidden rounded-xl border border-gold/15 bg-charcoal text-left transition hover:border-gold/40"
                )}
              >
                <div className="relative aspect-square bg-void">
                  {item.signedUrl && !isVoice && !isVideo ? (
                    <Image
                      src={item.signedUrl}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-cover transition group-hover:scale-105"
                      sizes="25vw"
                    />
                  ) : isVideo && item.signedUrl ? (
                    <video
                      src={item.signedUrl}
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  ) : yt ? (
                    <Image
                      src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="25vw"
                    />
                  ) : isVoice ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-gold">
                      <Mic className="h-8 w-8" />
                      <span className="text-xs text-muted-foreground">Voice</span>
                    </div>
                  ) : isReaction || isText ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
                      <Bookmark className="h-6 w-6 text-gold" />
                      <p className="line-clamp-3 text-xs text-ivory/80">
                        {item.pin?.caption || item.title}
                      </p>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Images className="h-6 w-6" />
                    </div>
                  )}
                  {item.kind === "pin" && (
                    <span className="absolute left-2 top-2 rounded-full bg-void/80 px-2 py-0.5 text-[10px] text-gold">
                      Kept
                    </span>
                  )}
                </div>
                <div className="space-y-0.5 p-2">
                  <p className="truncate text-xs text-ivory">{item.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.subtitle ? `${item.subtitle} · ` : ""}
                    {formatRelative(item.uploaded_at)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl border-gold/20 bg-charcoal">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading text-gold">
                  {active.title}
                </DialogTitle>
              </DialogHeader>
              {active.subtitle && (
                <p className="text-xs text-muted-foreground -mt-2">
                  {active.subtitle} · {formatRelative(active.uploaded_at)}
                </p>
              )}

              {active.media_type === "reaction" && active.meta ? (
                <div className="space-y-3 rounded-lg border border-gold/15 bg-void/50 p-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p className="flex items-center gap-2 text-sm text-ivory">
                      <Flame className="h-4 w-4 text-gold" />
                      Turned on ·{" "}
                      <span className="text-gold">
                        {String(active.meta.arousal_level ?? "—")}
                      </span>
                    </p>
                    <p className="flex items-center gap-2 text-sm text-ivory">
                      <HeartCrack className="h-4 w-4 text-gold" />
                      Jealous ·{" "}
                      <span className="text-gold">
                        {String(active.meta.jealousy_level ?? "—")}
                      </span>
                    </p>
                  </div>
                  {active.pin?.caption && (
                    <p className="whitespace-pre-wrap text-sm text-ivory/85">
                      {active.pin.caption}
                    </p>
                  )}
                </div>
              ) : active.media_type === "text" ? (
                <div className="rounded-lg border border-gold/15 bg-void/50 p-4">
                  <p className="whitespace-pre-wrap text-sm text-ivory/90">
                    {active.pin?.caption || "Kept text"}
                  </p>
                </div>
              ) : active.media_type === "voice" && active.file_path ? (
                <VoicePlayer filePath={active.file_path} />
              ) : active.media_type === "video" && active.signedUrl ? (
                <video
                  src={active.signedUrl}
                  controls
                  playsInline
                  className="w-full rounded-lg border border-gold/15 bg-black"
                />
              ) : (
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-void">
                  {active.signedUrl ? (
                    <Image
                      src={active.signedUrl}
                      alt={active.title}
                      fill
                      unoptimized
                      className="object-contain"
                      sizes="100vw"
                    />
                  ) : active.youtube_url ? (
                    <iframe
                      title={active.title}
                      src={`https://www.youtube.com/embed/${youtubeId(active.youtube_url) ?? ""}`}
                      className="h-full w-full"
                      allowFullScreen
                    />
                  ) : null}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {active.submission_id && (
                  <Button
                    asChild
                    variant="outline"
                    className="border-gold/30 text-gold"
                  >
                    <Link href={`/dashboard/submissions/${active.submission_id}`}>
                      Open submission
                    </Link>
                  </Button>
                )}
                {active.kind === "pin" && active.pin?.source_type === "date" && (
                  <Button
                    asChild
                    variant="outline"
                    className="border-gold/30 text-gold"
                  >
                    <Link href="/dashboard/dates">Open Dates</Link>
                  </Button>
                )}
                {active.kind === "pin" && active.pin?.source_type === "tease" && (
                  <Button
                    asChild
                    variant="outline"
                    className="border-gold/30 text-gold"
                  >
                    <Link href="/dashboard/teases">Open Teases</Link>
                  </Button>
                )}
                {isQueen && active.pin && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-muted-foreground hover:text-red-300"
                    onClick={() => void removePin(active)}
                  >
                    Unpin
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
