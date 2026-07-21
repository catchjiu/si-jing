"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  ImagePlus,
  Loader2,
  Lock,
  Timer,
  Unlock,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  denialDaysRemaining,
  fetchDenialLedger,
  fetchEdgeLogs,
  formatDenialBlockReason,
  queenAddDenialDays,
  queenAddEdgeDebt,
  queenClearDenialLedger,
  queenSetDenialNote,
  slaveLogEdge,
  type DenialLedger,
  type EdgeLog,
} from "@/lib/denial";
import { formatRelative } from "@/lib/format";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { resolveImageLocation } from "@/lib/location";
import { presignAndUpload, signObjectUrl } from "@/lib/storage/client";
import { formatRoleSpeech } from "@/lib/role-speech";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { EdgeLogCommentThread } from "@/components/denial/edge-log-comment-thread";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function DenialLedgerPanel() {
  const { isQueen, isSlave, profile } = useAuth();
  const [ledger, setLedger] = useState<DenialLedger | null>(null);
  const [logs, setLogs] = useState<EdgeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [edgeAmount, setEdgeAmount] = useState("5");
  const [dayAmount, setDayAmount] = useState("3");
  const [queenNote, setQueenNote] = useState("");

  const [edgeNote, setEdgeNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    try {
      const [nextLedger, nextLogs] = await Promise.all([
        fetchDenialLedger(supabase),
        fetchEdgeLogs(supabase),
      ]);
      const withUrls = await Promise.all(
        nextLogs.map(async (log) => {
          try {
            const signedUrl =
              (await signObjectUrl({
                bucket: "messages",
                path: log.image_path,
              })) ?? undefined;
            return { ...log, signedUrl };
          } catch {
            return log;
          }
        })
      );
      setLedger(nextLedger);
      setLogs(withUrls);
      if (nextLedger.queen_note) setQueenNote(nextLedger.queen_note);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load denial ledger"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const channel = supabase
      .channel("denial_ledger")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "denial_ledger" },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const daysLeft = useMemo(
    () => denialDaysRemaining(ledger?.denial_ends_at),
    [ledger?.denial_ends_at]
  );

  const setImage = (next: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  };

  const pickFile = (incoming: FileList | File[] | null) => {
    const candidate = incoming?.[0];
    if (!candidate) return;
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      toast.error("Use a JPG, PNG, WebP, or GIF image");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      toast.error("Image must be under 10MB");
      return;
    }
    setImage(candidate);
  };

  const addEdges = async () => {
    if (!isQueen) return;
    const n = Number.parseInt(edgeAmount, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Enter how many edges to add");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      const next = await queenAddEdgeDebt(supabase, n, queenNote);
      setLedger(next);
      toast.success(`Added ${n} edge${n === 1 ? "" : "s"} of debt`);
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Edge debt assigned",
          body: `${n} edge${n === 1 ? "" : "s"} required before orgasm permission`,
          url: "/dashboard/denial",
          target: "slave",
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add edges");
    } finally {
      setBusy(false);
    }
  };

  const addDays = async () => {
    if (!isQueen) return;
    const n = Number.parseInt(dayAmount, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Enter how many denial days to add");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      const next = await queenAddDenialDays(supabase, n, queenNote);
      setLedger(next);
      toast.success(`Added ${n} denial day${n === 1 ? "" : "s"}`);
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Denial extended",
          body: `${n} more day${n === 1 ? "" : "s"} of denial`,
          url: "/dashboard/denial",
          target: "slave",
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add days");
    } finally {
      setBusy(false);
    }
  };

  const saveQueenNote = async () => {
    if (!isQueen) return;
    setBusy(true);
    const supabase = createClient();
    try {
      const next = await queenSetDenialNote(supabase, queenNote);
      setLedger(next);
      toast.success("Note saved");
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Queen updated denial note",
          body: queenNote.trim().slice(0, 120) || "See Denial page",
          url: "/dashboard/denial",
          target: "slave",
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setBusy(false);
    }
  };

  const clearLedger = async () => {
    if (!isQueen) return;
    setBusy(true);
    const supabase = createClient();
    try {
      const next = await queenClearDenialLedger(supabase);
      setLedger(next);
      toast.success("Denial ledger cleared — orgasm permission unlocked");
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Denial ledger cleared",
          body: "You may request orgasm permission again",
          url: "/dashboard/requests",
          target: "slave",
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear ledger");
    } finally {
      setBusy(false);
    }
  };

  const logEdge = async () => {
    if (!isSlave || !profile) return;
    if (!file) {
      toast.error("Photo proof is required");
      return;
    }
    if (!ledger || ledger.edges_remaining <= 0) {
      toast.error("No edge debt remaining to log");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      const geo = await resolveImageLocation(file);
      if (geo) {
        toast.message(
          geo.source === "exif"
            ? "Photo location from image metadata"
            : "Photo location from device GPS"
        );
      }
      const uploadFile = await downsizeImageIfNeeded(file);
      const ext = uploadFile.name.split(".").pop() || "jpg";
      const imagePath = await presignAndUpload({
        bucket: "messages",
        file: uploadFile,
        contentType: uploadFile.type || "image/jpeg",
        ext,
        relativePath: `${profile.id}/edges/${Date.now()}.${ext}`,
      });
      const note = edgeNote.trim()
        ? formatRoleSpeech(edgeNote.trim(), "slave")
        : null;
      const result = await slaveLogEdge(supabase, imagePath, note);
      setLedger(result.ledger);
      setEdgeNote("");
      setImage(null);
      toast.success(
        `Edge logged · ${result.ledger.edges_remaining} remaining`
      );
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Edge logged",
          body: `${result.ledger.edges_remaining} edge${
            result.ledger.edges_remaining === 1 ? "" : "s"
          } still owed`,
          url: "/dashboard/denial",
          target: "queen",
        })
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log edge");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !ledger) {
    return <p className="text-sm text-muted-foreground">Loading ledger…</p>;
  }

  return (
    <div className="space-y-8">
      <div
        className={cn(
          "rounded-xl border p-5",
          ledger.balance_clear
            ? "border-emerald-500/30 bg-emerald-950/20"
            : "border-red-500/30 bg-red-950/20"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {ledger.balance_clear ? (
                <Unlock className="h-5 w-5 text-emerald-300" />
              ) : (
                <Lock className="h-5 w-5 text-red-300" />
              )}
              <h2 className="font-heading text-xl text-ivory">
                {ledger.balance_clear
                  ? "Balance clear"
                  : "Orgasm permission locked"}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDenialBlockReason(ledger)}
            </p>
            {ledger.queen_note ? (
              <p className="pt-2 text-sm italic text-ivory/80">
                “{ledger.queen_note}”
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="border-gold/40 text-gold"
            >
              {ledger.edges_remaining} edge
              {ledger.edges_remaining === 1 ? "" : "s"} owed
            </Badge>
            <Badge
              variant="outline"
              className="border-gold/40 text-gold"
            >
              <Timer className="mr-1 h-3 w-3" />
              {daysLeft > 0 ? `${daysLeft}d denial` : "No day lock"}
            </Badge>
          </div>
        </div>
      </div>

      {isQueen && (
        <section className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-5">
          <h3 className="font-heading text-lg text-gold">Assign debt</h3>
          <div className="space-y-2">
            <Label htmlFor="denial-note">Note for D (optional)</Label>
            <Textarea
              id="denial-note"
              value={queenNote}
              onChange={(e) => setQueenNote(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Why he’s locked / what you expect…"
              className="border-gold/20 bg-void/60"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              className="border-gold/30 text-gold"
              onClick={() => void saveQueenNote()}
            >
              Save note
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edge-amount">Required edges</Label>
              <div className="flex gap-2">
                <Input
                  id="edge-amount"
                  type="number"
                  min={1}
                  max={100}
                  value={edgeAmount}
                  onChange={(e) => setEdgeAmount(e.target.value)}
                  className="border-gold/20 bg-void/60"
                />
                <Button
                  type="button"
                  disabled={busy}
                  className="bg-gold text-void hover:bg-gold-muted"
                  onClick={() => void addEdges()}
                >
                  Add
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="day-amount">Denial days</Label>
              <div className="flex gap-2">
                <Input
                  id="day-amount"
                  type="number"
                  min={1}
                  max={365}
                  value={dayAmount}
                  onChange={(e) => setDayAmount(e.target.value)}
                  className="border-gold/20 bg-void/60"
                />
                <Button
                  type="button"
                  disabled={busy}
                  variant="outline"
                  className="border-gold/30"
                  onClick={() => void addDays()}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy || ledger.balance_clear}
            className="border-emerald-500/40 text-emerald-200"
            onClick={() => void clearLedger()}
          >
            <Unlock className="mr-2 h-4 w-4" />
            Clear ledger (unlock orgasm asks)
          </Button>
        </section>
      )}

      {isSlave && (
        <section className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-5">
          <h3 className="font-heading text-lg text-gold">Log an edge</h3>
          <p className="text-sm text-muted-foreground">
            Photo proof required. Each log reduces edge debt by one. Orgasm
            permission stays locked until edges and denial days are both clear.
          </p>
          {ledger.edges_remaining <= 0 ? (
            <p className="text-sm text-ivory/80">
              {daysLeft > 0
                ? "No edges owed — wait out the denial days."
                : "No edges owed. You may request orgasm permission."}
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Proof photo</Label>
                {preview ? (
                  <div className="relative aspect-[4/5] max-w-xs overflow-hidden rounded-lg border border-gold/20 bg-void">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="Edge proof preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-2 rounded-full bg-void/80 p-1 text-ivory"
                      onClick={() => setImage(null)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gold/30 bg-void/40 px-4 py-8 text-sm text-muted-foreground hover:border-gold/50">
                    <ImagePlus className="h-6 w-6 text-gold/70" />
                    Tap to add photo proof
                    <input
                      type="file"
                      accept={ACCEPTED_TYPES.join(",")}
                      className="hidden"
                      onChange={(e) => pickFile(e.target.files)}
                    />
                  </label>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edge-note">Note (optional)</Label>
                <Textarea
                  id="edge-note"
                  value={edgeNote}
                  onChange={(e) => setEdgeNote(e.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder="How long, how it felt…"
                  className="border-gold/20 bg-void/60"
                />
              </div>
              <Button
                type="button"
                disabled={busy || !file}
                className="bg-gold text-void hover:bg-gold-muted"
                onClick={() => void logEdge()}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Log edge
              </Button>
            </>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h3 className="font-heading text-lg text-gold">Edge log</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No edges logged yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="overflow-hidden rounded-xl border border-gold/15 bg-charcoal/80"
              >
                <div className="relative aspect-[4/5] bg-void">
                  {log.signedUrl ? (
                    <WatermarkedFrame
                      className="absolute inset-0"
                      mediaPath={log.image_path}
                    >
                      <Image
                        src={log.signedUrl}
                        alt="Edge log"
                        fill
                        unoptimized
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, 33vw"
                      />
                    </WatermarkedFrame>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Photo unavailable
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="text-xs text-muted-foreground">
                    {formatRelative(log.created_at)}
                  </p>
                  {log.note ? (
                    <p className="text-sm text-ivory/85">{log.note}</p>
                  ) : null}
                  <EdgeLogCommentThread edgeLogId={log.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
