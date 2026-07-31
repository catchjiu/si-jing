"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { WorkoutSession } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";

export function WorkoutQueenReaction({
  session,
  onSaved,
}: {
  session: WorkoutSession;
  onSaved: (next: WorkoutSession) => void;
}) {
  const [impressed, setImpressed] = useState(session.queen_impressed ?? 70);
  const [note, setNote] = useState(session.queen_note ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("workout_sessions")
      .update({
        queen_impressed: impressed,
        queen_note: note.trim() || null,
        queen_reacted_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onSaved(data as WorkoutSession);
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Queen reacted to your workout",
        body: `Impressed ${impressed}/100${note.trim() ? ` — ${note.trim().slice(0, 60)}` : ""}`,
        url: `/dashboard/workouts/${session.id}`,
        target: "slave",
        kind: "workout_reaction",
      })
    );
    toast.success("Reaction saved");
  };

  return (
    <div className="space-y-3 rounded-xl border border-gold/15 bg-charcoal/70 p-4">
      <p className="font-heading text-gold">Your reaction</p>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <Label>Impressed</Label>
          <span className="font-heading text-gold">{impressed}</span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[impressed]}
          onValueChange={(v) => setImpressed(v[0] ?? 0)}
        />
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Short note for him…"
        rows={2}
        className="border-gold/20 bg-void/60"
      />
      <Button
        type="button"
        size="sm"
        disabled={saving}
        onClick={() => void save()}
        className="bg-gold text-void hover:bg-gold-muted"
      >
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save reaction
      </Button>
    </div>
  );
}
