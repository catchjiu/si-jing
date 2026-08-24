"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, Upload, Wind } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { FartEntry } from "@/lib/types";
import type { CapturedVoice } from "@/lib/voice";
import {
  extensionForMime,
  inferAudioMime,
  normalizeVoiceBlob,
} from "@/lib/voice-format";
import { extractFartAudio, isFartMediaUpload } from "@/lib/extract-audio";
import { formatFartDate, localDateInputValue } from "@/lib/fart";
import { fartPageHref } from "@/lib/inbox-deep-links";
import { notifyPush } from "@/lib/push-client";
import { presignAndUpload, removeObject } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoicePlayer } from "@/components/voice/voice-player";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { FartCommentThread } from "@/components/fart/fart-comment-thread";
import { FartRatingPanel } from "@/components/fart/fart-rating-panel";

type FartRow = FartEntry;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function FartTrackerPanel({
  focusId,
  focusCommentId,
}: {
  focusId?: string | null;
  focusCommentId?: string | null;
}) {
  const { profile, isQueen, isSlave } = useAuth();
  const [entries, setEntries] = useState<FartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [captured, setCaptured] = useState<CapturedVoice | null>(null);
  const [note, setNote] = useState("");
  const [fartDate, setFartDate] = useState(localDateInputValue());
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [pendingExtract, setPendingExtract] = useState<File | null>(null);
  const [recorderKey, setRecorderKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!captured?.fileName) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(captured.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [captured]);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("fart_entries")
      .select("*")
      .order("fart_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Could not load fart log");
      setEntries([]);
    } else {
      setEntries((data as FartRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusId || loading) return;
    document
      .getElementById(`fart-${focusId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, loading, entries]);

  const save = async () => {
    if (!profile || !captured) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const blob = await normalizeVoiceBlob(
        captured.blob,
        captured.fileName
      );
      const mime = inferAudioMime({
        name: captured.fileName,
        type: blob.type,
      });
      const ext = extensionForMime(mime);
      const path = await presignAndUpload({
        bucket: "voice",
        file: blob,
        contentType: mime,
        ext,
        relativePath: `${profile.id}/fart/${Date.now()}.${ext}`,
      });

      const { data, error } = await supabase
        .from("fart_entries")
        .insert({
          created_by: profile.id,
          audio_path: path,
          duration_ms: captured.durationMs,
          note: note.trim() || null,
          fart_date: fartDate || localDateInputValue(),
        })
        .select("id")
        .single();
      if (error) throw error;

      toast.success("Fart logged");
      void notifyPush({
        title: "Queen logged a fart",
        body: note.trim() || `Fart · ${formatFartDate(fartDate)}`,
        url: fartPageHref(data.id as string),
        target: "slave",
        kind: "fart",
      });
      setCaptured(null);
      setNote("");
      setFartDate(localDateInputValue());
      setRecorderKey((k) => k + 1);
      if (fileRef.current) fileRef.current.value = "";
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save fart");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: FartRow) => {
    if (!isQueen) return;
    if (!window.confirm("Delete this fart from the log?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("fart_entries")
      .delete()
      .eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    try {
      await removeObject({ bucket: "voice", path: entry.audio_path });
    } catch {
      // row is gone even if storage cleanup fails
    }
    toast.success("Deleted");
    void load();
  };

  const applyExtracted = async (file: File) => {
    setExtracting(true);
    setPendingExtract(null);
    try {
      const extracted = await extractFartAudio(file);
      setCaptured({
        blob: extracted.blob,
        durationMs: extracted.durationMs,
        fileName: extracted.fileName,
      });
      setRecorderKey((k) => k + 1);
      toast.success(
        extracted.fromVideo
          ? "Sound extracted from video — save it to the log"
          : "Audio attached — save it to the log"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const blocked =
        (err instanceof DOMException && err.name === "NotAllowedError") ||
        /not allowed|user gesture|play\(\)/i.test(msg);
      if (blocked) {
        setPendingExtract(file);
        toast.error("Tap Extract sound to pull audio from the video");
      } else {
        toast.error(msg || "Could not extract audio from that file");
        if (fileRef.current) fileRef.current.value = "";
      }
    } finally {
      setExtracting(false);
    }
  };

  const onMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File is too large (max 50 MB)");
      e.target.value = "";
      return;
    }
    if (!isFartMediaUpload(file)) {
      toast.error("Use audio or video (.m4a, .mp3, .ogg, .wav, .mp4, .mov, .hevc)");
      e.target.value = "";
      return;
    }
    await applyExtracted(file);
  };

  if (loading && entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      {isQueen && (
        <div className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-4 sm:p-5">
          <div>
            <h2 className="font-heading text-lg text-ivory">Record a fart</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Record here, or upload audio or video. Video is converted to sound
              automatically. Noise filters are off for live recording.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fart-date" className="text-xs text-muted-foreground">
              Date of fart
            </Label>
            <Input
              id="fart-date"
              type="date"
              value={fartDate}
              onChange={(e) => setFartDate(e.target.value)}
              className="w-auto border-gold/20 bg-void/60"
              disabled={saving}
            />
          </div>
          <VoiceRecorder
            key={recorderKey}
            captureOnly
            rawAudio
            heading="Fart audio"
            onCaptured={setCaptured}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*,audio/ogg,video/ogg,video/hevc,.m4a,.mp4,.mov,.m4v,.aac,.wav,.caf,.mp3,.webm,.ogg,.oga,.ogv,.hevc,.h265"
              className="sr-only"
              onChange={(e) => void onMediaUpload(e)}
            />
            <Button
              type="button"
              variant="outline"
              className="border-gold/25"
              disabled={saving || extracting}
              onClick={() => fileRef.current?.click()}
            >
              {extracting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {extracting ? "Extracting sound…" : "Upload audio or video"}
            </Button>
            {captured?.fileName && (
              <span className="text-xs text-gold/80">
                Attached · {captured.fileName}
              </span>
            )}
            {pendingExtract && (
              <Button
                type="button"
                variant="outline"
                className="border-gold/40 text-gold"
                disabled={extracting}
                onClick={() => void applyExtracted(pendingExtract)}
              >
                Extract sound
              </Button>
            )}
          </div>
          {previewUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls src={previewUrl} className="h-9 max-w-full" />
          )}
          <div className="space-y-1.5">
            <Label
              htmlFor="fart-note"
              className="text-xs text-muted-foreground"
            >
              Note (optional)
            </Label>
            <Input
              id="fart-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 280))}
              placeholder="e.g. After lunch · loud one"
              className="border-gold/20 bg-void/60"
              disabled={saving}
            />
          </div>
          <Button
            type="button"
            disabled={!captured || saving || extracting}
            onClick={() => void save()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wind className="mr-2 h-4 w-4" />
            )}
            Save to log
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-heading text-xl text-gold">
          Log
          {entries.length > 0 && (
            <span className="ml-2 font-sans text-sm text-muted-foreground">
              {entries.length}
            </span>
          )}
        </h2>
        {entries.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
            {isQueen
              ? "No farts logged yet. Record the first one."
              : "Queen has not logged a fart yet."}
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry, index) => (
              <li
                key={entry.id}
                id={`fart-${entry.id}`}
                className={cn(
                  "space-y-3 rounded-xl border bg-charcoal/80 p-4",
                  entry.id === focusId ? "border-gold/40" : "border-gold/15"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-gold/80">
                    #{entries.length - index}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatFartDate(entry.fart_date)}
                  </span>
                  {entry.note && (
                    <span className="text-sm text-ivory/90">{entry.note}</span>
                  )}
                  {isQueen && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-7 px-2 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                      onClick={() => void remove(entry)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Delete
                    </Button>
                  )}
                </div>
                <VoicePlayer
                  filePath={entry.audio_path}
                  durationMs={entry.duration_ms}
                />
                <FartRatingPanel
                  entry={entry}
                  onSaved={(next) => {
                    setEntries((prev) =>
                      prev.map((row) =>
                        row.id === entry.id ? { ...row, ...next } : row
                      )
                    );
                  }}
                />
                <FartCommentThread
                  entryId={entry.id}
                  highlightCommentId={
                    entry.id === focusId ? focusCommentId : null
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {isSlave && entries.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Rate loudness and hotness, and leave a comment when Queen logs one.
          </p>
        )}
      </section>
    </div>
  );
}
