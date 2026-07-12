"use client";

import { useState } from "react";
import { CheckSquare, Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { TeaseUnlockTask } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type Props = {
  tasks: TeaseUnlockTask[];
  canComplete: boolean;
  timeReady: boolean;
  onChanged: () => void;
};

export function TeaseUnlockChecklist({
  tasks,
  canComplete,
  timeReady,
  onChanged,
}: Props) {
  const [completing, setCompleting] = useState<string | null>(null);
  const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order);
  const done = sorted.filter((t) => t.completed_at).length;
  const total = sorted.length;
  const allDone = total > 0 && done === total;

  if (total === 0) return null;

  const complete = async (task: TeaseUnlockTask) => {
    if (!canComplete || !timeReady || task.completed_at) return;
    setCompleting(task.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("tease_unlock_tasks")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", task.id)
      .is("completed_at", null);
    setCompleting(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const remaining = total - done - 1;
    if (remaining <= 0) {
      toast.success("All tasks done — tease unlocked");
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Tease unlocked by tasks",
          body: "D completed all unlock tasks",
          url: "/dashboard/teases",
          target: "queen",
        })
      );
    } else {
      toast.success(`Task done · ${done + 1}/${total}`);
    }
    onChanged();
  };

  return (
    <div className="space-y-2 rounded-lg border border-gold/15 bg-void/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gold/90">
          <ListChecks className="h-3.5 w-3.5" />
          Unlock tasks
        </p>
        <span className="text-xs text-muted-foreground">
          {done}/{total}
          {allDone ? " · unlocked" : ""}
        </span>
      </div>
      <ul className="space-y-2">
        {sorted.map((task) => {
          const doneTask = !!task.completed_at;
          const busy = completing === task.id;
          const interactive = canComplete && timeReady && !doneTask;

          return (
            <li
              key={task.id}
              className={cn(
                "flex items-start gap-2.5 text-sm",
                doneTask && "text-muted-foreground"
              )}
            >
              {interactive || busy ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void complete(task)}
                  className="mt-0.5 shrink-0"
                  aria-label={`Mark done: ${task.label}`}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gold" />
                  ) : (
                    <Checkbox
                      checked={false}
                      className="pointer-events-none border-gold/40 data-[state=checked]:bg-gold data-[state=checked]:text-void"
                    />
                  )}
                </button>
              ) : doneTask ? (
                <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              ) : (
                <Checkbox
                  checked={false}
                  disabled
                  className="mt-0.5 shrink-0 border-gold/25 opacity-60"
                />
              )}
              <span className={cn(doneTask && "line-through")}>{task.label}</span>
            </li>
          );
        })}
      </ul>
      {!timeReady && canComplete && (
        <p className="text-[11px] text-muted-foreground">
          Available after unlock time — then mark each task done.
        </p>
      )}
      {timeReady && canComplete && !allDone && (
        <p className="text-[11px] text-muted-foreground">
          Finish all tasks to see the picture clearly.
        </p>
      )}
    </div>
  );
}
