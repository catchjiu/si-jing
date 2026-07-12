"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Loader2, Lock, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { JournalVisibility } from "@/lib/types";
import { formatRoleSpeech } from "@/lib/role-speech";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface JournalEntryFormProps {
  onSuccess?: (entryId?: string) => void;
  className?: string;
}

export function JournalEntryForm({ onSuccess, className }: JournalEntryFormProps) {
  const { profile, isSlave } = useAuth();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<JournalVisibility>("shared");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSlave || !profile) {
      toast.error("Only D can write journal entries");
      return;
    }
    if (!body.trim()) {
      toast.error("Write something first");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("journal_entries")
      .insert({
        author_id: profile.id,
        body: formatRoleSpeech(body.trim(), "slave"),
        visibility,
        entry_date: new Date().toISOString().slice(0, 10),
        updated_at: now,
      })
      .select("id")
      .single();

    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Journal entry saved");
    if (visibility === "shared") {
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "New journal entry",
          body: body.trim().slice(0, 120),
          url: "/dashboard/journal",
          target: "queen",
        })
      );
    }
    setBody("");
    onSuccess?.(data?.id as string);
  };

  if (!isSlave) return null;

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-5 sm:p-6",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-gold" />
        <div>
          <h3 className="font-heading text-xl text-ivory">Today&apos;s reflection</h3>
          <p className="text-xs text-muted-foreground">
            Private thoughts or shared with Queen
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="journal-body">Entry</Label>
        <Textarea
          id="journal-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="How did today feel? What are you learning about yourself?"
          className="border-gold/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label>Visibility</Label>
        <Select
          value={visibility}
          onValueChange={(v) => setVisibility(v as JournalVisibility)}
        >
          <SelectTrigger className="border-gold/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shared">
              <span className="flex items-center gap-2">
                <Share2 className="h-3.5 w-3.5" />
                Shared with Queen
              </span>
            </SelectItem>
            <SelectItem value="private">
              <span className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                Private (only you)
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <BookOpen className="mr-2 h-4 w-4" />
        )}
        Save entry
      </Button>
    </form>
  );
}
