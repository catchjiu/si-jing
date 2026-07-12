"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Images } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EvidenceItem = {
  id: string;
  media_type: string;
  file_path: string | null;
  youtube_url: string | null;
  uploaded_at: string;
  submission_id: string;
  task_id: string;
  task_title: string;
  signedUrl?: string;
};

type Filter = "this_week" | "last_week" | "all" | string;

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
    const supabase = createClient();

    let submissionsQuery = supabase
      .from("submissions")
      .select("id, task_id, submitted_by, task:tasks(id, title)");

    if (isSlave) {
      submissionsQuery = submissionsQuery.eq("submitted_by", profile.id);
    }

    const { data: submissions } = await submissionsQuery;
    const subs = (submissions ?? []) as {
      id: string;
      task_id: string;
      submitted_by: string;
      task: { id: string; title: string } | null;
    }[];

    if (subs.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: media } = await supabase
      .from("submission_media")
      .select("*")
      .in(
        "submission_id",
        subs.map((s) => s.id)
      )
      .order("uploaded_at", { ascending: false });

    const bySub = new Map(subs.map((s) => [s.id, s]));
    const mapped: EvidenceItem[] = await Promise.all(
      ((media ?? []) as {
        id: string;
        media_type: string;
        file_path: string | null;
        youtube_url: string | null;
        uploaded_at: string;
        submission_id: string;
      }[]).map(async (m) => {
        const sub = bySub.get(m.submission_id);
        let signedUrl: string | undefined;
        if (m.file_path) {
          const { data } = await supabase.storage
            .from("submissions")
            .createSignedUrl(m.file_path, 3600);
          signedUrl = data?.signedUrl;
        }
        return {
          id: m.id,
          media_type: m.media_type,
          file_path: m.file_path,
          youtube_url: m.youtube_url,
          uploaded_at: m.uploaded_at,
          submission_id: m.submission_id,
          task_id: sub?.task_id ?? "",
          task_title: sub?.task?.title ?? "Task",
          signedUrl,
        };
      })
    );

    setItems(mapped);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const taskOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) {
      if (i.task_id) map.set(i.task_id, i.task_title);
    }
    return Array.from(map.entries());
  }, [items]);

  const filtered = useMemo(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    return items.filter((i) => {
      const d = new Date(i.uploaded_at);
      if (filter === "this_week") return d >= thisWeekStart;
      if (filter === "last_week") return d >= lastWeekStart && d < thisWeekStart;
      if (filter === "all") return true;
      return i.task_id === filter;
    });
  }, [items, filter]);

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
            ? "Browse submission media by week or task"
            : "Your submitted evidence"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["this_week", "This week"],
            ["last_week", "Last week"],
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
                  {item.signedUrl ? (
                    <Image
                      src={item.signedUrl}
                      alt={item.task_title}
                      fill
                      unoptimized
                      className="object-cover transition group-hover:scale-105"
                      sizes="25vw"
                    />
                  ) : yt ? (
                    <Image
                      src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`}
                      alt={item.task_title}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="25vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Images className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="space-y-0.5 p-2">
                  <p className="truncate text-xs text-ivory">{item.task_title}</p>
                  <p className="text-[10px] text-muted-foreground">
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
                  {active.task_title}
                </DialogTitle>
              </DialogHeader>
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-void">
                {active.signedUrl ? (
                  <Image
                    src={active.signedUrl}
                    alt={active.task_title}
                    fill
                    unoptimized
                    className="object-contain"
                    sizes="100vw"
                  />
                ) : active.youtube_url ? (
                  <iframe
                    title={active.task_title}
                    src={`https://www.youtube.com/embed/${youtubeId(active.youtube_url) ?? ""}`}
                    className="h-full w-full"
                    allowFullScreen
                  />
                ) : null}
              </div>
              <Button asChild variant="outline" className="border-gold/30 text-gold">
                <Link href={`/dashboard/submissions/${active.submission_id}`}>
                  Open submission
                </Link>
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
