"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { PunishmentType } from "@/lib/types";
import { PUNISHMENT_TYPE_LABELS } from "@/lib/punishments";
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

const TYPE_DESCRIPTIONS: Record<PunishmentType, string> = {
  contact_restriction:
    "D cannot send requests or messages until the timer ends.",
  custom: "Timed consequence with a custom title — honor system.",
  task_debt: "Creates N tasks; clears when Queen has approved all of them.",
  date_timeout: "D can view Dates but cannot post on the timeline.",
  orgasm_ban:
    "Honor system orgasm or edge ban — set the title accordingly. D must acknowledge.",
  privilege_freeze:
    "Blocks requests/messages, hides new rewards from D, and freezes Queen tease reveal.",
};

const DEFAULT_TITLES: Record<PunishmentType, string> = {
  contact_restriction: "Contact Restricted",
  custom: "Punishment",
  task_debt: "Task Debt",
  date_timeout: "Date Timeout",
  orgasm_ban: "Orgasm ban",
  privilege_freeze: "Privilege Freeze",
};

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
  const [taskCount, setTaskCount] = useState("3");
  const [taskTitles, setTaskTitles] = useState("");
  const [requireCheckIn, setRequireCheckIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isTaskDebt = type === "task_debt";
  const needsDuration = !isTaskDebt;

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

    const durationMinutes = isTaskDebt ? 0 : resolveMinutes();
    if (needsDuration && (!durationMinutes || durationMinutes < 1)) {
      toast.error("Choose a duration of at least 1 hour");
      return;
    }

    let debtCount = 3;
    if (isTaskDebt) {
      debtCount = Math.min(5, Math.max(1, parseInt(taskCount || "3", 10) || 3));
    }

    setSubmitting(true);
    const supabase = createClient();
    const startsAt = new Date();
    const endsAt = isTaskDebt
      ? startsAt
      : new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    const defaultTitle = DEFAULT_TITLES[type];
    const config: Record<string, unknown> = {};
    if (isTaskDebt) {
      config.tasks_required = debtCount;
      const customTitles = taskTitles
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (customTitles.length) config.task_titles = customTitles;
    }
    if (type === "orgasm_ban" && requireCheckIn) {
      config.require_check_in = true;
    }

    try {
      const { data: punishment, error } = await supabase
        .from("punishments")
        .insert({
          issued_by: profile.id,
          issued_to: recipientId,
          punishment_type: type,
          title: title.trim() || defaultTitle,
          reason: reason.trim() || null,
          duration_minutes: durationMinutes,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: "active",
          clearance_mode: isTaskDebt ? "task_debt" : "timed",
          config,
        })
        .select("id")
        .single();

      if (error) throw error;

      if (isTaskDebt && punishment?.id) {
        const customTitles = taskTitles
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        const titles = Array.from({ length: debtCount }, (_, i) =>
          customTitles[i] || `Debt ${i + 1}`
        );
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7);
        const { error: taskError } = await supabase.from("tasks").insert(
          titles.map((t) => ({
            title: t,
            description: `Task debt for punishment: ${title.trim() || defaultTitle}`,
            assigned_by: profile.id,
            assigned_to: recipientId,
            deadline: deadline.toISOString(),
            status: "pending",
            difficulty_level: "medium",
            is_recurring: false,
            punishment_id: punishment.id,
          }))
        );
        if (taskError) throw taskError;
      }

      if (type === "orgasm_ban" && requireCheckIn && punishment?.id) {
        const opens = new Date();
        const closes = new Date(opens.getTime() + 24 * 60 * 60 * 1000);
        const { error: checkInError } = await supabase.from("check_ins").insert({
          created_by: profile.id,
          assigned_to: recipientId,
          title: `Acknowledge: ${title.trim() || defaultTitle}`,
          prompt: "Confirm you understand and will obey this ban.",
          window_minutes: 24 * 60,
          opens_at: opens.toISOString(),
          closes_at: closes.toISOString(),
          status: "open",
          pending_punishment_id: punishment.id,
        });
        if (checkInError) throw checkInError;
      }

      toast.success("Punishment issued");
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Punishment issued",
          body: title.trim() || defaultTitle,
          url: "/dashboard/punishments",
          target: "slave",
        })
      );
      setTitle("");
      setReason("");
      setPreset("1440");
      setTaskCount("3");
      setTaskTitles("");
      setRequireCheckIn(false);
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
            Set a consequence with clear clearance rules
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
            {(Object.keys(PUNISHMENT_TYPE_LABELS) as PunishmentType[]).map(
              (key) => (
                <SelectItem key={key} value={key}>
                  {PUNISHMENT_TYPE_LABELS[key]}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{TYPE_DESCRIPTIONS[type]}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="punishment-title">Title (optional)</Label>
        <Input
          id="punishment-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            type === "orgasm_ban"
              ? "Orgasm ban or Edge ban"
              : DEFAULT_TITLES[type]
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

      {isTaskDebt && (
        <>
          <div className="space-y-2">
            <Label htmlFor="task-count">Number of tasks (1–5)</Label>
            <Input
              id="task-count"
              type="number"
              min={1}
              max={5}
              value={taskCount}
              onChange={(e) => setTaskCount(e.target.value)}
              className="border-red-500/20 bg-void/60"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-titles">
              Task titles (optional, comma-separated)
            </Label>
            <Input
              id="task-titles"
              value={taskTitles}
              onChange={(e) => setTaskTitles(e.target.value)}
              placeholder="Debt 1, Debt 2, Debt 3"
              className="border-red-500/20 bg-void/60"
            />
            <p className="text-xs text-muted-foreground">
              Defaults to Debt 1…Debt N if left blank
            </p>
          </div>
        </>
      )}

      {type === "orgasm_ban" && (
        <label className="flex items-center gap-2 text-sm text-ivory/80">
          <input
            type="checkbox"
            checked={requireCheckIn}
            onChange={(e) => setRequireCheckIn(e.target.checked)}
            className="rounded border-red-500/40"
          />
          Require acknowledgment check-in
        </label>
      )}

      {needsDuration && (
        <>
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
        </>
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
