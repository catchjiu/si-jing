"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  Loader2,
  Pause,
  Play,
  Plus,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleSpeech } from "@/lib/role-speech";
import { formatRelative } from "@/lib/format";
import { storyAudioFilename } from "@/lib/story-audio-filename";
import type { StoryInsult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_INSULT_CHARS = 2000;

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const star = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain =
    header.match(/filename\s*=\s*"([^"]+)"/i) ??
    header.match(/filename\s*=\s*([^;]+)/i);
  return plain?.[1]?.trim() || fallback;
}

function isInterruptedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  return (
    err.name === "AbortError" ||
    m === "Load failed" ||
    m === "Failed to fetch" ||
    /networkerror|aborted|interrupted|the user aborted/i.test(m)
  );
}

function speakErrorMessage(err: unknown, fallback: string): string {
  if (isInterruptedError(err)) {
    return "Audio was interrupted — keep this page open and tap again";
  }
  return err instanceof Error ? err.message : fallback;
}

async function fetchInsultBlob(insultId: string): Promise<{
  blob: Blob;
  filename: string;
}> {
  const res = await fetch(`/api/story/insults/${insultId}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ download: true }),
  });
  if (!res.ok) {
    let message = "Could not download audio";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  if (blob.size < 32) throw new Error("Could not create audio");
  const filename = filenameFromDisposition(
    res.headers.get("Content-Disposition"),
    storyAudioFilename(undefined, insultId)
  );
  return { blob, filename };
}

async function downloadInsultMp3(insultId: string, fallbackName: string) {
  const { blob, filename } = await fetchInsultBlob(insultId);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = (filename || fallbackName).endsWith(".mp3")
      ? filename || fallbackName
      : `${fallbackName}.mp3`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

type RowBusy = "play" | "download" | null;

export function StoryInsultsPanel({ className }: { className?: string }) {
  const { profile, isSlave } = useAuth();
  const [items, setItems] = useState<StoryInsult[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<RowBusy>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlById = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    async function loadInsults() {
      if (!profile?.id || !isSlave) {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase
        .from("story_insults")
        .select("id, author_id, body, created_at, updated_at")
        .eq("author_id", profile.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setItems([]);
      } else {
        setItems((data ?? []) as StoryInsult[]);
      }
      setLoading(false);
    }
    void loadInsults();
    return () => {
      cancelled = true;
    };
  }, [profile, isSlave]);

  useEffect(() => {
    const urls = urlById.current;
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      for (const url of urls.values()) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  if (!isSlave || !profile) return null;

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  };

  const ensureObjectUrl = async (insultId: string): Promise<string> => {
    const cached = urlById.current.get(insultId);
    if (cached) return cached;
    toast.message("Preparing Queen’s voice — keep this page open", {
      duration: 4000,
    });
    const { blob } = await fetchInsultBlob(insultId);
    const objectUrl = URL.createObjectURL(blob);
    urlById.current.set(insultId, objectUrl);
    return objectUrl;
  };

  const togglePlay = async (insult: StoryInsult) => {
    try {
      if (playingId === insult.id && audioRef.current) {
        audioRef.current.pause();
        setPlayingId(null);
        return;
      }
      stopAudio();
      setBusyId(insult.id);
      setBusyKind("play");
      const url = await ensureObjectUrl(insult.id);
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.addEventListener("ended", () => setPlayingId(null));
      audio.addEventListener("pause", () => {
        if (audioRef.current === audio) setPlayingId(null);
      });
      audio.addEventListener("play", () => setPlayingId(insult.id));
      audioRef.current = audio;
      await audio.play();
    } catch (err) {
      toast.error(speakErrorMessage(err, "Could not play insult"));
    } finally {
      setBusyId(null);
      setBusyKind(null);
    }
  };

  const onDownload = async (insult: StoryInsult) => {
    try {
      setBusyId(insult.id);
      setBusyKind("download");
      toast.message("Preparing MP3 — keep this page open", { duration: 4000 });
      await downloadInsultMp3(
        insult.id,
        storyAudioFilename(insult.body, insult.id)
      );
    } catch (err) {
      toast.error(speakErrorMessage(err, "Could not download audio"));
    } finally {
      setBusyId(null);
      setBusyKind(null);
    }
  };

  const onSave = async () => {
    const trimmed = formatRoleSpeech(draft.trim(), "queen");
    if (!trimmed) {
      toast.error("Write an insult first");
      return;
    }
    if (trimmed.length > MAX_INSULT_CHARS) {
      toast.error(`Keep it under ${MAX_INSULT_CHARS} characters`);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("story_insults")
      .insert({
        author_id: profile.id,
        body: trimmed,
        updated_at: now,
      })
      .select("id, author_id, body, created_at, updated_at")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft("");
    setItems((prev) => [data as StoryInsult, ...prev]);
    toast.success("Insult saved — play it in Queen’s voice");
  };

  const onDelete = async (insult: StoryInsult) => {
    if (!window.confirm("Delete this insult?")) return;
    stopAudio();
    urlById.current.delete(insult.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("story_insults")
      .delete()
      .eq("id", insult.id)
      .eq("author_id", profile.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== insult.id));
    toast.success("Insult deleted");
  };

  return (
    <section
      className={cn(
        "space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-5 sm:p-6",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <div>
          <h2 className="font-heading text-lg text-ivory">Insults</h2>
          <p className="text-xs text-muted-foreground">
            Write lines for Queen to say. They’re saved here, played in Her
            Fish voice, and downloadable as MP3. Only you can see this.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="story-insult-draft" className="text-xs text-muted-foreground">
          New insult
        </Label>
        <Textarea
          id="story-insult-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={MAX_INSULT_CHARS}
          disabled={saving}
          placeholder='e.g. Look at you — pathetic little slave, aching for My attention.'
          className="border-gold/20 bg-void/60 text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {draft.trim().length}/{MAX_INSULT_CHARS}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={saving || !draft.trim()}
            className="bg-gold text-void hover:bg-gold-muted"
            onClick={() => void onSave()}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save insult
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading insults…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No insults saved yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((insult) => {
            const rowBusy = busyId === insult.id ? busyKind : null;
            const playing = playingId === insult.id;
            return (
              <li
                key={insult.id}
                className="rounded-lg border border-gold/15 bg-void/40 p-3"
              >
                <p className="whitespace-pre-wrap text-sm text-ivory">
                  {insult.body}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-gold/25 px-2 text-xs"
                    disabled={rowBusy !== null}
                    onClick={() => void togglePlay(insult)}
                  >
                    {rowBusy === "play" ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : playing ? (
                      <Pause className="mr-1 h-3 w-3" />
                    ) : (
                      <Play className="mr-1 h-3 w-3" />
                    )}
                    {rowBusy === "play"
                      ? "Preparing…"
                      : playing
                        ? "Pause"
                        : "Play"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-gold/25 px-2 text-xs"
                    disabled={rowBusy !== null}
                    title="Download MP3"
                    aria-label="Download MP3"
                    onClick={() => void onDownload(insult)}
                  >
                    {rowBusy === "download" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    <span className="ml-1">MP3</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-destructive/30 px-2 text-xs text-destructive"
                    disabled={rowBusy !== null}
                    onClick={() => void onDelete(insult)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Delete
                  </Button>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {formatRelative(insult.created_at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
