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
  isIosVoiceMemoUpload,
  normalizeVoiceBlob,
  readAudioDurationMs,
} from "@/lib/voice-format";
import { formatRelative } from "@/lib/format";
import { fartPageHref } from "@/lib/inbox-deep-links";
import { notifyPush } from "@/lib/push-client";
import { presignAndUpload, removeObject } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoicePlayer } from "@/components/voice/voice-player";
import { VoiceRecorder } from "@/components/voice/voice-recorder";

type FartRow = FartEntry;

export function FartTrackerPanel({
  focusId,
}: {
  focusId?: string | null;
}) {
  const { profile, isQueen, isSlave } = useAuth();
  const [entries, setEntries] = useState<FartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [captured, setCaptured] = useState<CapturedVoice | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [recorderKey, setRecorderKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("fart_entries")
      .select("*")
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
        })
        .select("id")
        .single();
      if (error) throw error;

      toast.success("Fart logged");
      void notifyPush({
        title: "Queen logged a fart",
        body: note.trim() || "New audio in Fart Tracker",
        url: fartPageHref(data.id as string),
        target: "slave",
        kind: "fart",
      });
      setCaptured(null);
      setNote("");
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

  const onVoiceMemo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Voice memo is too large (max 25 MB)");
      e.target.value = "";
      return;
    }
    if (!isIosVoiceMemoUpload(file)) {
      toast.error("Use an iPhone Voice Memo or audio file (.m4a, .wav, .mp3)");
      e.target.value = "";
      return;
    }
    const durationMs = await readAudioDurationMs(file);
    setCaptured({
      blob: file,
      durationMs: durationMs || 200,
      fileName: file.name,
    });
    setRecorderKey((k) => k + 1);
    toast.success("Voice Memo attached — save it to the log");
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
              Record here, or upload an iPhone Voice Memo (.m4a). Noise filters
              are off for live recording.
            </p>
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
              accept="audio/*,.m4a,.mp4,.aac,.wav,.caf,.mp3"
              className="sr-only"
              onChange={(e) => void onVoiceMemo(e)}
            />
            <Button
              type="button"
              variant="outline"
              className="border-gold/25"
              disabled={saving}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Voice Memo
            </Button>
            {captured?.fileName && (
              <span className="text-xs text-gold/80">
                Attached · {captured.fileName}
              </span>
            )}
          </div>
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
            disabled={!captured || saving}
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
                  "rounded-xl border bg-charcoal/80 p-4",
                  entry.id === focusId ? "border-gold/40" : "border-gold/15"
                )}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-gold/80">
                    #{entries.length - index}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(entry.created_at)}
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
              </li>
            ))}
          </ul>
        )}
        {isSlave && entries.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Listen when Queen logs one. Push will alert you.
          </p>
        )}
      </section>
    </div>
  );
}
