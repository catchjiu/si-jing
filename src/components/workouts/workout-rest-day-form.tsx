"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { fetchQueenId, saveRestDay } from "@/lib/workout-persist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WorkoutRestDayForm({ className }: { className?: string }) {
  const { profile } = useAuth();
  const router = useRouter();
  const [performedAt, setPerformedAt] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const queenId = await fetchQueenId(supabase);
      if (!queenId) {
        toast.error("Queen account not found");
        return;
      }
      const id = await saveRestDay(supabase, {
        profileId: profile.id,
        queenId,
        performedAt,
        notes,
      });
      const { notifyPush } = await import("@/lib/push-client");
      await notifyPush({
        title: "Rest day logged",
        body: notes.trim() || "No workout today",
        url: `/dashboard/workouts/${id}`,
        target: "queen",
        kind: "workout_new",
      });
      toast.success("Rest day saved");
      router.push(`/dashboard/workouts/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={className}>
      <p className="mb-4 text-sm text-muted-foreground">
        Log a rest day or day off from training. Queen will see your note.
      </p>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rest-date">Date</Label>
          <Input
            id="rest-date"
            type="date"
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
            className="border-gold/20 bg-void/60"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rest-notes">Why no workout? (optional)</Label>
          <Input
            id="rest-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Recovery, travel, sore…"
            className="border-gold/20 bg-void/60"
          />
        </div>
        <Button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="w-full bg-gold text-void hover:bg-gold-muted"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save rest day
        </Button>
      </div>
    </div>
  );
}
