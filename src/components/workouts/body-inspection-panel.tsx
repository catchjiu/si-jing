"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck, Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { BodyInspection, BodyRatingSnapshot } from "@/lib/types";
import { weekStartMonday } from "@/lib/workout-stats";
import { formatRoleSpeech } from "@/lib/role-speech";
import { RoleSpeech } from "@/components/ui/role-speech";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type WeekStatus = {
  hasPic: boolean;
  hasRating: boolean;
  rating?: BodyRatingSnapshot | null;
};

export function BodyInspectionPanel() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const weekStart = weekStartMonday();
  const [inspection, setInspection] = useState<BodyInspection | null>(null);
  const [week, setWeek] = useState<WeekStatus>({
    hasPic: false,
    hasRating: false,
  });
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(70);
  const [note, setNote] = useState("");
  const [replyAllowed, setReplyAllowed] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [replying, setReplying] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    const { data: ensuredId, error: ensureErr } = await supabase.rpc(
      "ensure_body_inspection_week",
      { p_week_start: weekStart }
    );
    if (ensureErr) {
      console.error(ensureErr);
    }

    let slaveId = profile.id;
    if (isQueen) {
      const { data: slave } = await supabase
        .from("users")
        .select("id")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      if (slave?.id) slaveId = slave.id as string;
    }

    const [{ data: insp }, { data: pic }, { data: snap }] = await Promise.all([
      supabase
        .from("body_inspections")
        .select("*")
        .eq("week_start", weekStart)
        .eq("slave_id", slaveId)
        .maybeSingle(),
      supabase
        .from("workout_weekly_pics")
        .select("id, file_path")
        .eq("week_start", weekStart)
        .eq("created_by", slaveId)
        .maybeSingle(),
      supabase
        .from("body_rating_snapshots")
        .select("*")
        .eq("week_start", weekStart)
        .eq("rated_for", slaveId)
        .maybeSingle(),
    ]);

    const row = (insp as BodyInspection | null) ?? null;
    setInspection(row);
    if (row) {
      setScore(row.inspection_score ?? 70);
      setNote(row.queen_note ?? "");
      setReplyAllowed(row.reply_allowed);
      setReplyDraft(row.slave_reply ?? "");
    } else if (ensuredId) {
      const { data: again } = await supabase
        .from("body_inspections")
        .select("*")
        .eq("id", ensuredId as string)
        .maybeSingle();
      const againRow = again as BodyInspection | null;
      setInspection(againRow);
      if (againRow) {
        setScore(againRow.inspection_score ?? 70);
        setNote(againRow.queen_note ?? "");
        setReplyAllowed(againRow.reply_allowed);
        setReplyDraft(againRow.slave_reply ?? "");
      }
    }

    setWeek({
      hasPic: Boolean(pic && (pic as { file_path?: string | null }).file_path),
      hasRating: Boolean(snap),
      rating: (snap as BodyRatingSnapshot | null) ?? null,
    });
    setLoading(false);
  }, [profile, weekStart, isQueen]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const saveReview = async () => {
    if (!isQueen || !inspection) return;
    setSaving(true);
    const supabase = createClient();
    const status =
      week.hasPic && week.hasRating ? "complete" : "reviewed";
    const { data, error } = await supabase
      .from("body_inspections")
      .update({
        inspection_score: score,
        queen_note: note.trim()
          ? formatRoleSpeech(note.trim(), "queen")
          : null,
        reply_allowed: replyAllowed,
        queen_reviewed_at: new Date().toISOString(),
        status,
      })
      .eq("id", inspection.id)
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInspection(data as BodyInspection);
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Body inspection reviewed",
        body: note.trim()
          ? note.trim().slice(0, 100)
          : `Inspection score ${score}/100`,
        url: "/dashboard/workouts",
        target: "slave",
        kind: "body_inspection",
      })
    );
    toast.success("Inspection saved");
  };

  const submitReply = async () => {
    if (!isSlave || !inspection || !inspection.reply_allowed) return;
    const text = formatRoleSpeech(replyDraft.trim(), "slave");
    if (!text) {
      toast.error("Write a reply");
      return;
    }
    setReplying(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("body_inspections")
      .update({
        slave_reply: text,
        slave_replied_at: new Date().toISOString(),
      })
      .eq("id", inspection.id)
      .select("*")
      .single();
    setReplying(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInspection(data as BodyInspection);
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Inspection reply",
        body: text.slice(0, 100),
        url: "/dashboard/workouts",
        target: "queen",
        kind: "body_inspection_reply",
      })
    );
    toast.success("Reply sent");
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading inspection…</p>;
  }

  const mandatoryMet = week.hasPic && week.hasRating;

  return (
    <section className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading flex items-center gap-2 text-xl text-gold">
            <ClipboardCheck className="h-5 w-5" />
            Weekly inspection
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Week of {weekStart} — progress pic + body rating required
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase tracking-wider",
            mandatoryMet
              ? "border-emerald-500/40 text-emerald-300"
              : "border-gold/50 text-gold"
          )}
        >
          {mandatoryMet ? "Requirements met" : "Incomplete"}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            week.hasPic
              ? "border-emerald-500/30 text-emerald-200"
              : "border-gold/20 text-muted-foreground"
          )}
        >
          Progress pic: {week.hasPic ? "Uploaded" : "Missing"}
        </div>
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            week.hasRating
              ? "border-emerald-500/30 text-emerald-200"
              : "border-gold/20 text-muted-foreground"
          )}
        >
          Body rating:{" "}
          {week.hasRating
            ? `Overall ${week.rating?.overall ?? "—"}`
            : isQueen
              ? "Not scored this week"
              : "Awaiting Queen"}
        </div>
      </div>

      {isSlave && !week.hasPic && (
        <p className="text-sm text-gold/90">
          Upload this week&apos;s progress photo below before Queen finishes
          inspection.
        </p>
      )}

      {isQueen && (
        <div className="space-y-3 rounded-lg border border-gold/15 bg-void/40 p-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Inspection score</Label>
              <span className="font-heading text-gold">{score}</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[score]}
              onValueChange={(v) => setScore(v[0] ?? 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Queen&apos;s comment</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Private inspection note he can read…"
              className="border-gold/20 bg-void/60"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ivory/90">
            <input
              type="checkbox"
              checked={replyAllowed}
              onChange={(e) => setReplyAllowed(e.target.checked)}
              className="accent-gold"
            />
            Allow D to reply
          </label>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void saveReview()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Save inspection
          </Button>
        </div>
      )}

      {inspection?.queen_note && (
        <div className="rounded-lg border border-gold/15 bg-void/40 p-3 text-sm">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Queen&apos;s comment
            {inspection.inspection_score != null
              ? ` · ${inspection.inspection_score}/100`
              : ""}
          </p>
          <RoleSpeech text={inspection.queen_note} role="queen" />
        </div>
      )}

      {inspection?.slave_reply && (
        <div className="rounded-lg border border-gold/10 bg-void/30 p-3 text-sm">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            D&apos;s reply
          </p>
          <RoleSpeech text={inspection.slave_reply} role="slave" />
        </div>
      )}

      {isSlave && inspection?.reply_allowed && !inspection.slave_reply && (
        <div className="space-y-2">
          <Label>Your reply</Label>
          <Textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            rows={3}
            placeholder="Reply to Queen’s inspection…"
            className="border-gold/20 bg-void/60"
          />
          <Button
            type="button"
            size="sm"
            disabled={replying}
            onClick={() => void submitReply()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {replying ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-2 h-3.5 w-3.5" />
            )}
            Send reply
          </Button>
        </div>
      )}

      {isSlave &&
        inspection?.queen_note &&
        !inspection.reply_allowed &&
        !inspection.slave_reply && (
          <p className="text-xs text-muted-foreground">
            You can read Queen&apos;s comment. Reply is locked until She allows
            it.
          </p>
        )}
    </section>
  );
}
