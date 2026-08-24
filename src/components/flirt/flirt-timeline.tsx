"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Loader2, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { formatRoleSpeech } from "@/lib/role-speech";
import { flirtPageHref } from "@/lib/inbox-deep-links";
import type { FlirtEntryWithSignedUrl, Profile } from "@/lib/types";
import { RoleSpeech } from "@/components/ui/role-speech";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { FlirtEntryCommentThread } from "@/components/flirt/flirt-entry-comment-thread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  presignAndUpload,
  removeObject,
  signObjectUrl,
} from "@/lib/storage/client";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type Props = {
  guyId: string;
  guyName: string;
  canPost: boolean;
  focusEntryId?: string | null;
};

type FlirtEntryRow = FlirtEntryWithSignedUrl & {
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

async function withSignedUrls(
  entries: FlirtEntryRow[]
): Promise<FlirtEntryRow[]> {
  return Promise.all(
    entries.map(async (e) => {
      if (!e.file_path) return e;
      const signedUrl =
        (await signObjectUrl({
          bucket: "flirt",
          path: e.file_path,
        })) ?? undefined;
      return { ...e, signedUrl };
    })
  );
}

function formatEntryDate(date: string) {
  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

export function FlirtTimeline({ guyId, guyName, canPost, focusEntryId }: Props) {
  const { profile, isQueen } = useAuth();
  const [entries, setEntries] = useState<FlirtEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [entryDate, setEntryDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("flirt_entries")
      .select("*, author:users!author_id(id, username, role)")
      .eq("guy_id", guyId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const signed = await withSignedUrls((data ?? []) as FlirtEntryRow[]);
    setEntries(signed);
    setLoading(false);
  }, [guyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`flirt-entries:${guyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "flirt_entries",
          filter: `guy_id=eq.${guyId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [guyId, load]);

  const grouped = useMemo(() => {
    const map = new Map<string, FlirtEntryRow[]>();
    for (const entry of entries) {
      const key = entry.entry_date;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [entries]);

  const clearMedia = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
  };

  const pickFile = (f: File | null) => {
    clearMedia();
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) {
      toast.error("Use a photo");
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      toast.error("Photo too large (max 10 MB)");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const publish = async () => {
    if (!canPost || !profile) return;
    const text = body.trim();
    if (!text && !file) {
      toast.error("Write something or attach a photo");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    try {
      let filePath: string | null = null;
      let mediaKind: "text" | "image" = "text";
      const speechBody = text ? formatRoleSpeech(text, profile.role) : null;

      if (file) {
        const uploadFile = await downsizeImageIfNeeded(file);
        const ext = uploadFile.name.split(".").pop() || "jpg";
        filePath = await presignAndUpload({
          bucket: "flirt",
          file: uploadFile,
          contentType: uploadFile.type || "image/jpeg",
          ext,
          relativePath: `${profile.id}/${guyId}/${Date.now()}.${ext}`,
        });
        mediaKind = "image";
      }

      const { data: row, error } = await supabase
        .from("flirt_entries")
        .insert({
          guy_id: guyId,
          author_id: profile.id,
          body: speechBody,
          media_kind: mediaKind,
          file_path: filePath,
          entry_date: entryDate || new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) throw error;

      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "New flirt entry",
          body: `${guyName}${text ? `: ${text.slice(0, 80)}` : " · photo"}`,
          url: flirtPageHref(guyId, { entryId: row.id }),
          target: isQueen ? "slave" : "queen",
          kind: "flirt_entry",
        })
      );

      toast.success("Entry added");
      setBody("");
      clearMedia();
      void load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not add entry";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (entry: FlirtEntryRow) => {
    const canDelete = profile?.id === entry.author_id || !!isQueen;
    if (!canDelete) return;
    setDeleting(entry.id);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("flirt_entries")
        .delete()
        .eq("id", entry.id);
      if (error) throw error;
      if (entry.file_path) {
        await removeObject({ bucket: "flirt", path: entry.file_path }).catch(
          () => undefined
        );
      }
      toast.success("Entry removed");
      void load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not delete";
      toast.error(msg);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {canPost && (
        <div className="space-y-3 rounded-xl border border-gold/15 bg-charcoal/80 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gold/90">
            Add entry
          </p>
          <div className="space-y-2">
            <Label htmlFor="flirt-entry-date">Date</Label>
            <Input
              id="flirt-entry-date"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What happened…"
            rows={3}
          />
          {preview && (
            <div className="relative h-40 w-full overflow-hidden rounded-lg border border-gold/15">
              <Image
                src={preview}
                alt="Preview"
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                <ImagePlus className="mr-2 h-4 w-4" />
                Photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </Button>
            {preview && (
              <Button type="button" variant="ghost" size="sm" onClick={clearMedia}>
                Clear photo
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={submitting}
              onClick={() => void publish()}
              className="ml-auto"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Post
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading timeline…</p>
      ) : grouped.length === 0 ? (
        <p className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
          No entries yet.
        </p>
      ) : (
        <div className="space-y-8">
          {grouped.map(([date, dayEntries]) => (
            <section key={date} className="space-y-3">
              <h3 className="font-heading text-sm tracking-wide text-gold">
                {formatEntryDate(date)}
              </h3>
              <ul className="space-y-3">
                {dayEntries.map((entry) => {
                  const canDelete =
                    profile?.id === entry.author_id || !!isQueen;

                  return (
                    <li
                      key={entry.id}
                      id={`flirt-entry-${entry.id}`}
                      className={cn(
                        "rounded-xl border bg-charcoal/70 p-4",
                        focusEntryId === entry.id
                          ? "border-gold/40 ring-1 ring-gold/20"
                          : "border-gold/15"
                      )}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          <span
                            className={
                              entry.author?.role === "queen"
                                ? "text-gold"
                                : "text-ivory/70"
                            }
                          >
                            {entry.author?.username ?? "Someone"}
                            {entry.author?.role === "queen" ? " · Queen" : ""}
                          </span>
                          {" · "}
                          {formatRelative(entry.created_at)}
                        </p>
                        {canDelete && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={deleting === entry.id}
                            onClick={() => void remove(entry)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-red-300"
                          >
                            {deleting === entry.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                      {entry.body && (
                        <p className="whitespace-pre-wrap text-sm text-ivory/90">
                          <RoleSpeech
                            text={entry.body}
                            role={entry.author?.role}
                          />
                        </p>
                      )}
                      {entry.media_kind === "image" && entry.signedUrl && (
                        <WatermarkedFrame
                          className="mt-3 aspect-[4/5] max-h-96 w-full rounded-lg border border-gold/15"
                          mediaPath={entry.file_path}
                        >
                          <Image
                            src={entry.signedUrl}
                            alt="Flirt photo"
                            fill
                            unoptimized
                            className="object-cover"
                          />
                        </WatermarkedFrame>
                      )}
                      <FlirtEntryCommentThread
                        entryId={entry.id}
                        guyId={guyId}
                        guyName={guyName}
                        defaultExpanded={focusEntryId === entry.id}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
