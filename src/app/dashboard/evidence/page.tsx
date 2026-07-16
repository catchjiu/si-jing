"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bookmark,
  Check,
  Flame,
  HeartCrack,
  Images,
  Mic,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { unpinEvidence, unpinEvidenceMany } from "@/lib/evidence-pins";
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

const LONG_PRESS_MS = 480;
const MOVE_CANCEL_PX = 10;

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
  /** Recurring series id (parent) or the task itself — used for filter pools */
  series_id?: string;
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

function pinSubtitle(sourceType: EvidencePin["source_type"]): string {
  switch (sourceType) {
    case "date":
      return "Pinned from Date";
    case "date_post":
      return "Pinned from Date timeline";
    case "tease":
      return "Pinned from Tease";
    case "direct_message":
      return "Pinned from Inbox";
    case "worship_message":
    case "worship_gallery_message":
      return "Pinned from Worship";
    case "voice_note":
      return "Pinned voice";
    default:
      return "Kept";
  }
}

function EvidenceThumb({
  item,
  onSigned,
}: {
  item: EvidenceItem;
  onSigned: (item: EvidenceItem) => Promise<EvidenceItem>;
}) {
  const [url, setUrl] = useState(item.signedUrl);
  const yt = item.youtube_url ? youtubeId(item.youtube_url) : null;
  const isReaction = item.media_type === "reaction";
  const isVoice = item.media_type === "voice";
  const isVideo = item.media_type === "video";
  const isText = item.media_type === "text";
  const caption = item.pin?.caption?.trim() || null;
  const showCaptionOnImage =
    !!caption &&
    !!item.file_path &&
    (item.pin?.source_type === "worship_message" ||
      item.pin?.source_type === "worship_gallery_message" ||
      item.pin?.source_type === "date_post" ||
      item.pin?.source_type === "direct_message" ||
      item.pin?.source_type === "tease");

  useEffect(() => {
    setUrl(item.signedUrl);
  }, [item.signedUrl]);

  useEffect(() => {
    // Sign whenever we have a file path (including text pins that also carry a photo)
    if (url || !item.file_path || isVoice || isReaction) return;
    let cancelled = false;
    void onSigned(item).then((signed) => {
      if (!cancelled && signed.signedUrl) setUrl(signed.signedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [item, onSigned, url, isVoice, isReaction]);

  if (url && !isVoice && !isVideo) {
    return (
      <>
        <Image
          src={url}
          alt={item.title}
          fill
          unoptimized
          className="object-cover transition group-hover:scale-105"
          sizes="25vw"
        />
        {showCaptionOnImage && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-void/95 via-void/70 to-transparent px-2 pb-2 pt-8">
            <p className="line-clamp-2 text-[10px] leading-snug text-ivory/90">
              {caption}
            </p>
          </div>
        )}
      </>
    );
  }
  if (isVideo && url) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={url}
        muted
        playsInline
        className="h-full w-full object-cover"
      />
    );
  }
  if (yt) {
    return (
      <Image
        src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`}
        alt={item.title}
        fill
        unoptimized
        className="object-cover"
        sizes="25vw"
      />
    );
  }
  if (isVoice) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-gold">
        <Mic className="h-8 w-8" />
        <span className="text-xs text-muted-foreground">Voice</span>
      </div>
    );
  }
  if (isReaction || (isText && !item.file_path)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
        <Bookmark className="h-6 w-6 text-gold" />
        <p className="line-clamp-3 text-xs text-ivory/80">
          {item.pin?.caption || item.title}
        </p>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Images className="h-6 w-6" />
    </div>
  );
}

export default function EvidencePage() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("this_week");
  const [active, setActive] = useState<EvidenceItem | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const longPressRef = useRef<{
    timer: number | null;
    startX: number;
    startY: number;
    itemId: string | null;
    fired: boolean;
  }>({ timer: null, startX: 0, startY: 0, itemId: null, fired: false });

  const clearLongPress = useCallback(() => {
    const ref = longPressRef.current;
    if (ref.timer != null) {
      window.clearTimeout(ref.timer);
      ref.timer = null;
    }
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const ensureSigned = useCallback(async (item: EvidenceItem) => {
    if (item.signedUrl || !item.file_path) return item;
    const bucket = item.storage_bucket ?? "";
    if (!isStorageBucket(bucket)) return item;
    try {
      const signedUrl =
        (await signObjectUrl({ bucket, path: item.file_path })) ?? undefined;
      return { ...item, signedUrl };
    } catch {
      return item;
    }
  }, []);

  const openItem = useCallback(
    async (item: EvidenceItem) => {
      const signed = await ensureSigned(item);
      setActive(signed);
      if (signed.signedUrl && signed.signedUrl !== item.signedUrl) {
        setItems((prev) =>
          prev.map((x) => (x.id === signed.id ? signed : x))
        );
      }
    },
    [ensureSigned]
  );

  const toggleSelect = useCallback((item: EvidenceItem) => {
    if (item.kind !== "pin" || !item.pin) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.pin!.id)) next.delete(item.pin!.id);
      else next.add(item.pin!.id);
      return next;
    });
  }, []);

  const beginSelect = useCallback((item: EvidenceItem) => {
    if (item.kind !== "pin" || !item.pin) {
      toast.message("Long-press a Kept item to select");
      return;
    }
    setSelecting(true);
    setSelectedIds(new Set([item.pin.id]));
    setActive(null);
  }, []);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const supabase = createClient();

      let submissionsQuery = supabase
        .from("submissions")
        .select(
          "id, task_id, submitted_by, task:tasks(id, title, parent_task_id)"
        );

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
        task: {
          id: string;
          title: string;
          parent_task_id: string | null;
        } | null;
      }[];

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

        const signedSubs = mediaRows.map((m) => {
          const sub = bySub.get(m.submission_id);
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
            series_id:
              sub?.task?.parent_task_id ?? sub?.task_id ?? sub?.task?.id ?? "",
            signedUrl: undefined,
            storage_bucket: "submissions",
          } satisfies EvidenceItem;
        });
        mapped.push(...signedSubs);
      }

      const pinRows = (pins ?? []) as EvidencePin[];

      // Text-only worship photo comments: attach the parent entry image for preview
      const worshipIdsNeedingPhoto = pinRows
        .filter(
          (p) =>
            p.source_type === "worship_message" &&
            !p.file_path &&
            p.source_id
        )
        .map((p) => p.source_id);

      const entryImageByMessageId = new Map<string, string>();
      if (worshipIdsNeedingPhoto.length > 0) {
        const { data: msgs } = await supabase
          .from("worship_messages")
          .select("id, worship_id, image_path")
          .in("id", worshipIdsNeedingPhoto);
        const msgRows = (msgs ?? []) as {
          id: string;
          worship_id: string;
          image_path: string | null;
        }[];
        const entryIds = [
          ...new Set(
            msgRows.filter((m) => !m.image_path).map((m) => m.worship_id)
          ),
        ];
        for (const m of msgRows) {
          if (m.image_path) entryImageByMessageId.set(m.id, m.image_path);
        }
        if (entryIds.length > 0) {
          const { data: entries } = await supabase
            .from("worship_entries")
            .select("id, image_path")
            .in("id", entryIds);
          const byEntry = new Map(
            ((entries ?? []) as { id: string; image_path: string }[]).map(
              (e) => [e.id, e.image_path]
            )
          );
          for (const m of msgRows) {
            if (!entryImageByMessageId.has(m.id)) {
              const path = byEntry.get(m.worship_id);
              if (path) entryImageByMessageId.set(m.id, path);
            }
          }
        }
      }

      const signedPins = pinRows.map((p) => {
        const enrichedPath =
          p.file_path ||
          (p.source_type === "worship_message"
            ? entryImageByMessageId.get(p.source_id) ?? null
            : null);
        return {
          id: `pin-${p.id}`,
          kind: "pin" as const,
          media_type: enrichedPath && p.media_kind === "text" ? "image" : p.media_kind,
          file_path: enrichedPath,
          youtube_url: p.youtube_url,
          uploaded_at: p.pinned_at,
          title: p.title,
          subtitle: pinSubtitle(p.source_type),
          signedUrl: undefined,
          storage_bucket: enrichedPath
            ? p.storage_bucket ?? "worship"
            : p.storage_bucket,
          meta: p.meta,
          pin: {
            ...p,
            file_path: enrichedPath,
            storage_bucket: enrichedPath
              ? p.storage_bucket ?? "worship"
              : p.storage_bucket,
            media_kind:
              enrichedPath && p.media_kind === "text" ? "image" : p.media_kind,
          },
        } satisfies EvidenceItem;
      });
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

  useEffect(() => {
    return () => clearLongPress();
  }, [clearLongPress]);

  const taskOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) {
      // Group recurring occurrences under one pool (parent series id)
      if (i.series_id) map.set(i.series_id, i.title);
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
      return i.series_id === filter || i.task_id === filter;
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
    setItems((prev) => prev.filter((x) => x.pin?.id !== item.pin!.id));
    setSelectedIds((prev) => {
      if (!prev.has(item.pin!.id)) return prev;
      const next = new Set(prev);
      next.delete(item.pin!.id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (!isQueen || selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (
      !window.confirm(
        count === 1
          ? "Delete this kept item from Evidence?"
          : `Delete ${count} kept items from Evidence?`
      )
    ) {
      return;
    }
    setDeleting(true);
    const ids = Array.from(selectedIds);
    const { error } = await unpinEvidenceMany(ids);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      count === 1 ? "Removed from Evidence" : `Removed ${count} items`
    );
    setItems((prev) =>
      prev.filter((x) => !x.pin || !selectedIds.has(x.pin.id))
    );
    exitSelectMode();
  };

  const onCardPointerDown = (
    e: ReactPointerEvent,
    item: EvidenceItem
  ) => {
    if (!isQueen || e.button !== 0) return;
    clearLongPress();
    const ref = longPressRef.current;
    ref.startX = e.clientX;
    ref.startY = e.clientY;
    ref.itemId = item.id;
    ref.fired = false;
    ref.timer = window.setTimeout(() => {
      ref.fired = true;
      beginSelect(item);
    }, LONG_PRESS_MS);
  };

  const onCardPointerMove = (e: ReactPointerEvent) => {
    const ref = longPressRef.current;
    if (ref.timer == null) return;
    const dx = Math.abs(e.clientX - ref.startX);
    const dy = Math.abs(e.clientY - ref.startY);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearLongPress();
  };

  const onCardPointerUp = (item: EvidenceItem) => {
    const fired = longPressRef.current.fired;
    clearLongPress();
    if (fired) return;
    if (selecting) {
      if (item.kind === "pin") toggleSelect(item);
      return;
    }
    void openItem(item);
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
            ? "Task submissions plus moments you keep — long-press Kept items to select and delete"
            : "Your submitted evidence and moments Queen kept"}
        </p>
      </div>

      {isQueen && selecting && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-void/95 px-4 py-3 backdrop-blur">
          <p className="text-sm text-ivory">
            <span className="font-medium text-gold">{selectedIds.size}</span>{" "}
            selected
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={exitSelectMode}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={deleting || selectedIds.size === 0}
              onClick={() => void deleteSelected()}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      )}

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
            onClick={() => {
              exitSelectMode();
              setFilter(id);
            }}
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
            onClick={() => {
              exitSelectMode();
              setFilter(id);
            }}
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
            const pinId = item.pin?.id;
            const isSelected = !!(pinId && selectedIds.has(pinId));
            const canSelect = isQueen && item.kind === "pin";
            return (
              <button
                key={item.id}
                type="button"
                onPointerDown={(e) => onCardPointerDown(e, item)}
                onPointerMove={onCardPointerMove}
                onPointerUp={() => onCardPointerUp(item)}
                onPointerCancel={clearLongPress}
                onPointerLeave={clearLongPress}
                onContextMenu={(e) => {
                  if (isQueen && item.kind === "pin") e.preventDefault();
                }}
                className={cn(
                  "group overflow-hidden rounded-xl border bg-charcoal text-left transition select-none",
                  isSelected
                    ? "border-gold ring-2 ring-gold/40"
                    : selecting && canSelect
                      ? "border-gold/25 hover:border-gold/50"
                      : "border-gold/15 hover:border-gold/40",
                  selecting && !canSelect && "opacity-50"
                )}
              >
                <div className="relative aspect-square bg-void">
                  <EvidenceThumb item={item} onSigned={ensureSigned} />
                  {item.kind === "pin" && (
                    <span className="absolute left-2 top-2 rounded-full bg-void/80 px-2 py-0.5 text-[10px] text-gold">
                      Kept
                    </span>
                  )}
                  {selecting && canSelect && (
                    <span
                      className={cn(
                        "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border",
                        isSelected
                          ? "border-gold bg-gold text-void"
                          : "border-gold/40 bg-void/70 text-transparent"
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
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

      <Dialog
        open={!!active && !selecting}
        onOpenChange={(o) => !o && setActive(null)}
      >
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
              ) : active.media_type === "text" && !active.file_path ? (
                <div className="rounded-lg border border-gold/15 bg-void/50 p-4">
                  <p className="whitespace-pre-wrap text-sm text-ivory/90">
                    {active.pin?.caption || "Kept text"}
                  </p>
                </div>
              ) : active.media_type === "voice" && active.file_path ? (
                <VoicePlayer filePath={active.file_path} />
              ) : active.media_type === "video" && active.signedUrl ? (
                <div className="space-y-3">
                  <video
                    src={active.signedUrl}
                    controls
                    playsInline
                    className="w-full rounded-lg border border-gold/15 bg-black"
                  />
                  {active.pin?.caption && (
                    <p className="whitespace-pre-wrap rounded-lg border border-gold/15 bg-void/50 px-4 py-3 text-sm text-ivory/90">
                      {active.pin.caption}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
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
                  {active.pin?.caption &&
                    (active.signedUrl || active.youtube_url) && (
                    <p className="whitespace-pre-wrap rounded-lg border border-gold/15 bg-void/50 px-4 py-3 text-sm text-ivory/90">
                      {active.pin.caption}
                    </p>
                  )}
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
