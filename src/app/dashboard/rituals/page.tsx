"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Flame, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { syncProtocolState } from "@/lib/protocol";
import { formatRelative } from "@/lib/format";
import type {
  Profile,
  Ritual,
  RitualOccurrence,
  RitualScheduleKind,
  RitualWithOccurrences,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function RitualsPage() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [rituals, setRituals] = useState<RitualWithOccurrences[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<RitualScheduleKind>("daily");
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [weekday, setWeekday] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    await syncProtocolState(supabase);

    let ritualQuery = supabase
      .from("rituals")
      .select("*")
      .order("created_at", { ascending: true });
    if (isSlave) ritualQuery = ritualQuery.eq("assigned_to", profile.id);

    const { data: ritualData } = await ritualQuery;
    const list = (ritualData ?? []) as Ritual[];

    const enriched = await Promise.all(
      list.map(async (r) => {
        const [{ data: occ }, { data: streak }] = await Promise.all([
          supabase
            .from("ritual_occurrences")
            .select("*")
            .eq("ritual_id", r.id)
            .order("due_date", { ascending: false })
            .limit(21),
          supabase.rpc("ritual_streak", { p_ritual_id: r.id }),
        ]);
        return {
          ...r,
          occurrences: (occ ?? []) as RitualOccurrence[],
          streak: Number(streak ?? 0),
        } satisfies RitualWithOccurrences;
      })
    );

    setRituals(enriched);
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

  const createRitual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile || !recipient) return;
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("rituals").insert({
      created_by: profile.id,
      assigned_to: recipient.id,
      name: name.trim(),
      description: description.trim() || null,
      schedule_kind: kind,
      time_of_day: timeOfDay.length === 5 ? `${timeOfDay}:00` : timeOfDay,
      weekday: kind === "weekly" ? parseInt(weekday, 10) : null,
      is_active: true,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.rpc("ensure_ritual_occurrences", { look_ahead_days: 14 });
    toast.success("Ritual created");
    setName("");
    setDescription("");
    void load();
  };

  const completeToday = async (ritual: RitualWithOccurrences) => {
    if (!isSlave) return;
    const today = todayISO();
    const occ = ritual.occurrences?.find((o) => o.due_date === today);
    if (!occ || occ.status !== "pending") {
      toast.error("Nothing pending for today");
      return;
    }
    setCompleting(occ.id);
    const supabase = createClient();
    const { data: streak } = await supabase.rpc("ritual_streak", {
      p_ritual_id: ritual.id,
    });
    const nextStreak = Number(streak ?? 0) + 1;
    const { error } = await supabase
      .from("ritual_occurrences")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        streak_at_completion: nextStreak,
      })
      .eq("id", occ.id);
    setCompleting(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Completed · streak ${nextStreak}`);
    void load();
  };

  const toggleActive = async (ritual: Ritual) => {
    if (!isQueen) return;
    const supabase = createClient();
    await supabase
      .from("rituals")
      .update({
        is_active: !ritual.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ritual.id);
    void load();
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const today = todayISO();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-3xl text-ivory">
          <Flame className="h-7 w-7 text-gold" />
          Rituals
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Named recurring duties with streaks and miss history
        </p>
      </div>

      {isQueen && recipient && (
        <form
          onSubmit={createRitual}
          className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-6"
        >
          <h2 className="font-heading text-xl text-gold">New ritual</h2>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Morning report"
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as RitualScheduleKind)}
              >
                <SelectTrigger className="border-gold/20 bg-void/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Time of day</Label>
              <Input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="border-gold/20 bg-void/60"
              />
            </div>
            {kind === "weekly" && (
              <div className="space-y-2">
                <Label>Weekday</Label>
                <Select value={weekday} onValueChange={setWeekday}>
                  <SelectTrigger className="border-gold/20 bg-void/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create ritual
          </Button>
        </form>
      )}

      <section className="space-y-4">
        {rituals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rituals yet.</p>
        ) : (
          rituals.map((ritual) => {
            const todayOcc = ritual.occurrences?.find(
              (o) => o.due_date === today
            );
            const recent = (ritual.occurrences ?? []).slice(0, 14);
            return (
              <article
                key={ritual.id}
                className={cn(
                  "rounded-xl border bg-charcoal/80 p-5",
                  ritual.is_active ? "border-gold/20" : "border-muted/30 opacity-70"
                )}
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-heading text-lg text-ivory">
                      {ritual.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {ritual.schedule_kind}
                      {ritual.schedule_kind === "weekly" &&
                        ritual.weekday != null &&
                        ` · ${WEEKDAYS[ritual.weekday]}`}{" "}
                      · {String(ritual.time_of_day).slice(0, 5)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-gold/40 text-gold"
                  >
                    <Flame className="mr-1 h-3 w-3" />
                    Streak {ritual.streak ?? 0}
                  </Badge>
                </div>
                {ritual.description && (
                  <p className="mb-3 text-sm text-ivory/75 whitespace-pre-wrap">
                    {ritual.description}
                  </p>
                )}

                {todayOcc && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        todayOcc.status === "completed"
                          ? "border-emerald-500/40 text-emerald-300"
                          : todayOcc.status === "missed"
                            ? "border-red-500/40 text-red-300"
                            : "border-gold/40 text-gold"
                      }
                    >
                      Today · {todayOcc.status}
                    </Badge>
                    {isSlave && todayOcc.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() => void completeToday(ritual)}
                        disabled={completing === todayOcc.id}
                        className="bg-gold text-void hover:bg-gold-muted"
                      >
                        {completing === todayOcc.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-3.5 w-3.5" />
                        )}
                        Mark complete
                      </Button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {recent.map((o) => (
                    <span
                      key={o.id}
                      title={`${o.due_date} · ${o.status}${
                        o.completed_at
                          ? ` · ${formatRelative(o.completed_at)}`
                          : ""
                      }`}
                      className={cn(
                        "inline-block h-2.5 w-2.5 rounded-full",
                        o.status === "completed" && "bg-emerald-400",
                        o.status === "missed" && "bg-red-400",
                        o.status === "pending" && "bg-gold/40"
                      )}
                    />
                  ))}
                </div>

                {isQueen && (
                  <div className="mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-muted"
                      onClick={() => void toggleActive(ritual)}
                    >
                      {ritual.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
