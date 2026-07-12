"use client";

import { useEffect, useState } from "react";
import { formatDistanceStrict } from "date-fns";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { TaskStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TaskBeginButtonProps {
  taskId: string;
  status: TaskStatus;
  startedAt: string | null;
  onStarted?: () => void;
  className?: string;
}

export function TaskBeginButton({
  taskId,
  status,
  startedAt,
  onStarted,
  className,
}: TaskBeginButtonProps) {
  const { isSlave } = useAuth();
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!startedAt) {
      setElapsed("");
      return;
    }
    const tick = () => {
      setElapsed(
        formatDistanceStrict(new Date(startedAt), new Date(), {
          addSuffix: false,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!isSlave || status === "approved" || status === "submitted") {
    return null;
  }

  const begin = async () => {
    setBusy(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("tasks")
      .update({
        status: "in_progress",
        started_at: now,
        updated_at: now,
      })
      .eq("id", taskId);

    setBusy(false);
    if (error) {
      toast.error("Could not start task");
      return;
    }
    toast.success("Task begun — Queen can see your timer");
    onStarted?.();
  };

  if (startedAt || status === "in_progress") {
    return (
      <div
        className={cn(
          "rounded-lg border border-gold/25 bg-gold/5 px-4 py-3",
          className
        )}
      >
        <p className="text-[10px] uppercase tracking-wider text-gold">
          In progress
        </p>
        <p className="mt-1 font-heading text-2xl tabular-nums text-ivory">
          {elapsed || "—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Started {new Date(startedAt ?? Date.now()).toLocaleString()}
        </p>
      </div>
    );
  }

  if (status !== "pending") return null;

  return (
    <Button
      type="button"
      onClick={() => void begin()}
      disabled={busy}
      className={cn("bg-gold text-void hover:bg-gold-muted", className)}
    >
      <Play className="mr-2 h-4 w-4" />
      Begin task
    </Button>
  );
}

interface TaskElapsedDisplayProps {
  startedAt: string | null;
  className?: string;
}

/** Read-only elapsed timer for Queen view */
export function TaskElapsedDisplay({
  startedAt,
  className,
}: TaskElapsedDisplayProps) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!startedAt) {
      setElapsed("");
      return;
    }
    const tick = () => {
      setElapsed(
        formatDistanceStrict(new Date(startedAt), new Date(), {
          addSuffix: false,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;

  return (
    <div className={cn("text-right", className)}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Elapsed
      </p>
      <p className="font-heading text-xl tabular-nums text-orange-400">
        {elapsed}
      </p>
    </div>
  );
}
