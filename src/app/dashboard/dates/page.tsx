"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CalendarHeart,
  Loader2,
  Trash2,
  Flame,
  HeartCrack,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatDeadline, formatRelative } from "@/lib/format";
import type { Profile, QueenDate } from "@/lib/types";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { DateTimeline } from "@/components/dates/date-timeline";
import { KeepInEvidenceButton } from "@/components/evidence/keep-in-evidence-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type LevelsDraft = {
  arousal: number;
  jealousy: number;
};

function levelsFromDate(d: QueenDate): LevelsDraft {
  return {
    arousal: d.arousal_level ?? 50,
    jealousy: d.jealousy_level ?? 50,
  };
}

export default function DatesPage() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [items, setItems] = useState<QueenDate[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [levels, setLevels] = useState<Record<string, LevelsDraft>>({});
  const [savingLevels, setSavingLevels] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("queen_dates")
      .select("*")
      .order("scheduled_at", { ascending: false });
    if (isSlave) query = query.eq("assigned_to", profile.id);
    const { data } = await query;
    const rows = (data ?? []) as QueenDate[];
    setItems(rows);
    setLevels((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (!next[row.id]) next[row.id] = levelsFromDate(row);
      }
      return next;
    });
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!isQueen) return;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      setRecipient((data as Profile | null) ?? null);
    })();
  }, [isQueen]);

  const createDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile || !recipient) return;
    if (!scheduledLocal) {
      toast.error("Pick a day and time");
      return;
    }
    const scheduled = new Date(scheduledLocal);
    if (Number.isNaN(scheduled.getTime())) {
      toast.error("Pick a valid day and time");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("queen_dates").insert({
      created_by: profile.id,
      assigned_to: recipient.id,
      title: title.trim() || null,
      notes: notes.trim() || null,
      scheduled_at: scheduled.toISOString(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Date posted");
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Queen has a date",
        body: title.trim() || formatDeadline(scheduled.toISOString()),
        url: "/dashboard/dates",
        target: "slave",
      })
    );
    setTitle("");
    setNotes("");
    setScheduledLocal("");
    void load();
  };

  const saveLevels = async (date: QueenDate) => {
    if (!isSlave || !profile) return;
    const draft = levels[date.id] ?? levelsFromDate(date);
    setSavingLevels(date.id);
    const supabase = createClient();
    const first = !date.reacted_at;
    const { error } = await supabase
      .from("queen_dates")
      .update({
        arousal_level: draft.arousal,
        jealousy_level: draft.jealousy,
        reacted_at: date.reacted_at ?? new Date().toISOString(),
      })
      .eq("id", date.id)
      .eq("assigned_to", profile.id);
    setSavingLevels(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Levels updated");
    if (first) {
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Date reaction from D",
          body: date.title || "D updated how he feels",
          url: "/dashboard/dates",
          target: "queen",
        })
      );
    }
    void load();
  };

  const deleteDate = async (id: string) => {
    if (!isQueen) return;
    setDeleting(id);
    const supabase = createClient();
    const { error } = await supabase.from("queen_dates").delete().eq("id", id);
    setDeleting(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Date removed");
    void load();
  };

  const updateLevels = (id: string, patch: Partial<LevelsDraft>) => {
    setLevels((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { arousal: 50, jealousy: 50 }), ...patch },
    }));
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-3xl text-ivory">
          <CalendarHeart className="h-7 w-7 text-gold" />
          Dates
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Post when you’re on a date — D’s timeline fills with posts, media, and voice"
            : "Follow Queen’s dates and post to the timeline as it unfolds"}
        </p>
      </div>

      {isQueen && recipient && (
        <form
          onSubmit={createDate}
          className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-6"
        >
          <h2 className="font-heading text-xl text-gold">Post a date</h2>
          <div className="space-y-2">
            <Label>Title (optional)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dinner out…"
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Where / with whom — whatever you want D to know"
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Day & time</Label>
            <Input
              type="datetime-local"
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
              required
              className="border-gold/20 bg-void/60"
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarHeart className="mr-2 h-4 w-4" />
            )}
            Post date
          </Button>
        </form>
      )}

      <section className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dates yet.</p>
        ) : (
          items.map((d) => {
            const upcoming = new Date(d.scheduled_at) > new Date();
            const draft = levels[d.id] ?? levelsFromDate(d);

            return (
              <article
                key={d.id}
                className="space-y-4 rounded-xl border border-gold/15 bg-charcoal/80 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-heading text-xl text-ivory">
                        {d.title || "Date"}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          upcoming
                            ? "border-gold/50 text-gold"
                            : "border-muted text-muted-foreground"
                        )}
                      >
                        {upcoming ? "Upcoming" : "Past"}
                      </Badge>
                      {d.reacted_at && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 text-emerald-300"
                        >
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gold">
                      {formatDeadline(d.scheduled_at)}
                    </p>
                    {d.notes && (
                      <p className="whitespace-pre-wrap text-sm text-ivory/80">
                        {d.notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Posted {formatRelative(d.created_at)}
                      {d.reacted_at
                        ? ` · first activity ${formatRelative(d.reacted_at)}`
                        : ""}
                    </p>
                  </div>
                  {isQueen && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={deleting === d.id}
                      onClick={() => void deleteDate(d.id)}
                      className="text-muted-foreground hover:text-red-300"
                    >
                      {deleting === d.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>

                {(isQueen || isSlave) && (
                  <div className="space-y-3 rounded-lg border border-gold/10 bg-void/40 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-gold/90">
                      How D feels
                    </p>
                    {isQueen ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex items-center gap-2 text-sm text-ivory">
                          <Flame className="h-4 w-4 text-gold" />
                          Turned on ·{" "}
                          <span className="font-heading text-gold">
                            {d.arousal_level ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-ivory">
                          <HeartCrack className="h-4 w-4 text-gold" />
                          Jealous ·{" "}
                          <span className="font-heading text-gold">
                            {d.jealousy_level ?? "—"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <div className="flex items-end justify-between gap-2">
                            <Label className="flex items-center gap-1.5">
                              <Flame className="h-3.5 w-3.5 text-gold" />
                              How turned on
                            </Label>
                            <span className="font-heading text-lg text-gold">
                              {draft.arousal}
                            </span>
                          </div>
                          <Slider
                            value={[draft.arousal]}
                            onValueChange={(v) =>
                              updateLevels(d.id, { arousal: v[0] ?? 50 })
                            }
                            min={0}
                            max={100}
                            step={1}
                            aria-label="Turned on level"
                            className="py-2 **:data-[slot=slider-range]:bg-gold **:data-[slot=slider-thumb]:border-gold **:data-[slot=slider-thumb]:bg-gold"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-end justify-between gap-2">
                            <Label className="flex items-center gap-1.5">
                              <HeartCrack className="h-3.5 w-3.5 text-gold" />
                              How jealous
                            </Label>
                            <span className="font-heading text-lg text-gold">
                              {draft.jealousy}
                            </span>
                          </div>
                          <Slider
                            value={[draft.jealousy]}
                            onValueChange={(v) =>
                              updateLevels(d.id, { jealousy: v[0] ?? 50 })
                            }
                            min={0}
                            max={100}
                            step={1}
                            aria-label="Jealousy level"
                            className="py-2 **:data-[slot=slider-range]:bg-gold **:data-[slot=slider-thumb]:border-gold **:data-[slot=slider-thumb]:bg-gold"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingLevels === d.id}
                          onClick={() => void saveLevels(d)}
                          className="bg-gold text-void hover:bg-gold-muted"
                        >
                          {savingLevels === d.id ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Update levels
                        </Button>
                      </>
                    )}
                    {isQueen && d.arousal_level != null && (
                      <KeepInEvidenceButton
                        sourceType="date"
                        sourceId={d.id}
                        mediaKind="reaction"
                        title={d.title ? `Date · ${d.title}` : "Date levels"}
                        meta={{
                          arousal_level: d.arousal_level,
                          jealousy_level: d.jealousy_level,
                          scheduled_at: d.scheduled_at,
                        }}
                        label="Keep levels"
                      />
                    )}
                  </div>
                )}

                <DateTimeline
                  dateId={d.id}
                  dateTitle={d.title}
                  canPost={!!isSlave || !!isQueen}
                  onPosted={() => void load()}
                />

                <VoiceNotes
                  entityType="date"
                  entityId={d.id}
                  compact
                  title="Voice"
                  allowEvidencePin
                  evidenceTitle={d.title ? `Date · ${d.title}` : "Date voice"}
                />
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
