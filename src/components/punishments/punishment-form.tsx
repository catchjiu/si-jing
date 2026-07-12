"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { PunishmentType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DURATION_PRESETS = [
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 6 * 60 },
  { label: "12 hours", minutes: 12 * 60 },
  { label: "24 hours", minutes: 24 * 60 },
  { label: "3 days", minutes: 3 * 24 * 60 },
  { label: "1 week", minutes: 7 * 24 * 60 },
  { label: "Custom", minutes: -1 },
] as const;

interface PunishmentFormProps {
  recipientId: string;
  onSuccess?: () => void;
  className?: string;
}

export function PunishmentForm({
  recipientId,
  onSuccess,
  className,
}: PunishmentFormProps) {
  const { profile, isQueen } = useAuth();
  const [type, setType] = useState<PunishmentType>("contact_restriction");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState<string>("1440"); // 24h default
  const [customDays, setCustomDays] = useState("0");
  const [customHours, setCustomHours] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  const resolveMinutes = () => {
    if (preset === "custom") {
      const days = Math.max(0, parseInt(customDays || "0", 10));
      const hours = Math.max(0, parseInt(customHours || "0", 10));
      return days * 24 * 60 + hours * 60;
    }
    return parseInt(preset, 10);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile) {
      toast.error("Only the Queen can issue punishments");
      return;
    }

    const durationMinutes = resolveMinutes();
    if (!durationMinutes || durationMinutes < 1) {
      toast.error("Choose a duration of at least 1 hour");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    const defaultTitle =
      type === "contact_restriction" ? "Contact Restricted" : "Punishment";

    try {
      const { error } = await supabase.from("punishments").insert({
        issued_by: profile.id,
        issued_to: recipientId,
        punishment_type: type,
        title: title.trim() || defaultTitle,
        reason: reason.trim() || null,
        duration_minutes: durationMinutes,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "active",
      });

      if (error) throw error;

      toast.success("Punishment issued");
      setTitle("");
      setReason("");
      setPreset("1440");
      onSuccess?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not issue punishment";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isQueen) return null;

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "space-y-5 rounded-xl border border-red-500/25 bg-charcoal/80 p-6",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-500/40 bg-red-950/40">
          <Ban className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <h3 className="font-heading text-xl text-ivory">Issue Punishment</h3>
          <p className="text-xs text-muted-foreground">
            Set a consequence with a clear duration
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Select
          value={type}
          onValueChange={(v) => setType(v as PunishmentType)}
        >
          <SelectTrigger className="w-full border-red-500/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contact_restriction">
              Contact restriction
            </SelectItem>
            <SelectItem value="custom">Custom punishment</SelectItem>
          </SelectContent>
        </Select>
        {type === "contact_restriction" && (
          <p className="text-xs text-muted-foreground">
            D will see a countdown and must not initiate contact until it ends.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="punishment-title">Title (optional)</Label>
        <Input
          id="punishment-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            type === "contact_restriction"
              ? "Contact Restricted"
              : "Name this punishment"
          }
          className="border-red-500/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="punishment-reason">Reason (optional)</Label>
        <Textarea
          id="punishment-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why this is being issued…"
          rows={3}
          className="border-red-500/20 bg-void/60"
        />
      </div>

      <div className="space-y-2">
        <Label>Duration</Label>
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger className="w-full border-red-500/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_PRESETS.map((p) => (
              <SelectItem
                key={p.label}
                value={p.minutes === -1 ? "custom" : String(p.minutes)}
              >
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="custom-days">Days</Label>
            <Input
              id="custom-days"
              type="number"
              min={0}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              className="border-red-500/20 bg-void/60"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-hours">Hours</Label>
            <Input
              id="custom-hours"
              type="number"
              min={0}
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              className="border-red-500/20 bg-void/60"
            />
          </div>
        </div>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-red-700 text-white hover:bg-red-600"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Issuing…
          </>
        ) : (
          <>
            <Ban className="mr-2 h-4 w-4" />
            Issue punishment
          </>
        )}
      </Button>
    </form>
  );
}
