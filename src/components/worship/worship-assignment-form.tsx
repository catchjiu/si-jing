"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleSpeech } from "@/lib/role-speech";
import { postToTopicThread } from "@/lib/inbox";
import { notifyPush } from "@/lib/push-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  onSuccess?: () => void;
  className?: string;
};

export function WorshipAssignmentForm({ onSuccess, className }: Props) {
  const { profile, isQueen } = useAuth();
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [minEntries, setMinEntries] = useState(3);
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isQueen) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!topic.trim()) {
      toast.error("Give the assignment a topic");
      return;
    }
    if (!dueAt) {
      toast.error("Set a deadline");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    try {
      const topicText = formatRoleSpeech(topic.trim(), "queen");
      const descText = description.trim()
        ? formatRoleSpeech(description.trim(), "queen")
        : null;

      const { data: assignmentId, error } = await supabase.rpc(
        "create_worship_assignment",
        {
          p_topic: topicText,
          p_description: descText,
          p_min_entries: minEntries,
          p_due_at: new Date(dueAt).toISOString(),
        }
      );
      if (error) throw error;

      const { data: row } = await supabase
        .from("worship_assignments")
        .select("id, gallery_id")
        .eq("id", assignmentId)
        .maybeSingle();

      if (row?.id) {
        await postToTopicThread(supabase, {
          topic: "worship",
          senderId: profile.id,
          content: `Worship assignment: fill “${topicText}” with at least ${minEntries} photo${minEntries === 1 ? "" : "s"} by ${new Date(dueAt).toLocaleString()}.`,
          attachmentType: "worship_assignment",
          attachmentId: row.id as string,
        });
        void notifyPush({
          title: "Worship assignment",
          body: `Fill “${topicText}” — ${minEntries} photos`,
          url: row.gallery_id
            ? `/dashboard/worship/${row.gallery_id}`
            : "/dashboard/worship",
          target: "slave",
        });
      }

      toast.success("Worship assignment created");
      setTopic("");
      setDescription("");
      setMinEntries(3);
      setDueAt("");
      onSuccess?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create assignment"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className={cn(
        "space-y-4 rounded-xl border border-gold/15 bg-charcoal/80 p-5",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-gold" />
        <div>
          <h2 className="font-heading text-xl text-ivory">Assign worship</h2>
          <p className="text-xs text-muted-foreground">
            Creates a gallery for D with a deadline and minimum photo count
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wa-topic">Topic</Label>
        <Input
          id="wa-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Morning devotion"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wa-desc">Instructions</Label>
        <Textarea
          id="wa-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What he should capture and how to present it"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wa-min">Minimum photos</Label>
          <Input
            id="wa-min"
            type="number"
            min={1}
            max={50}
            value={minEntries}
            onChange={(e) =>
              setMinEntries(Math.max(1, Number(e.target.value) || 1))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wa-due">Deadline</Label>
          <Input
            id="wa-due"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarClock className="h-4 w-4" />
        )}
        Assign
      </Button>
    </form>
  );
}
