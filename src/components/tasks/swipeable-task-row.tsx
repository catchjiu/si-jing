"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Task } from "@/lib/types";
import { recurrenceLabel } from "@/lib/tasks";
import {
  canSwipeCompleteTask,
  deleteTask,
  markTaskComplete,
} from "@/lib/task-actions";
import { formatDeadline, isOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/tasks/status-badge";
import { Countdown } from "@/components/tasks/countdown";
import { Badge } from "@/components/ui/badge";

const SWIPE_THRESHOLD = 72;
const MAX_SWIPE = 112;
const TAP_MOVE_PX = 8;

interface SwipeableTaskRowProps {
  task: Task;
  onAction?: () => void;
}

function TaskRowContent({ task }: { task: Task }) {
  const overdue = isOverdue(task.deadline) && task.status !== "approved";
  const recur = recurrenceLabel(task);
  const done = task.status === "approved";
  const submitted = task.status === "submitted";

  return (
    <>
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        ) : submitted ? (
          <Clock className="h-5 w-5 text-gold" />
        ) : (
          <Circle
            className={cn("h-5 w-5", overdue ? "text-red-400" : "text-gold/50")}
          />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "font-medium text-ivory group-hover:text-gold transition-colors",
              done && "text-ivory/60 line-through decoration-ivory/30"
            )}
          >
            {task.title}
          </p>
          {recur && (
            <Badge
              variant="outline"
              className="border-royal/50 bg-royal/20 text-[10px] uppercase tracking-wider text-ivory/70"
            >
              {recur}
            </Badge>
          )}
          <StatusBadge status={task.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Due {formatDeadline(task.deadline).replace(/, \d{4}/, "")}</span>
          <Countdown
            deadline={task.deadline}
            showLabels={false}
            className={cn(
              "font-mono",
              overdue ? "text-red-400" : "text-gold/80"
            )}
          />
        </div>
      </div>
    </>
  );
}

export function SwipeableTaskRow({ task, onAction }: SwipeableTaskRowProps) {
  const router = useRouter();
  const { isQueen, isSlave, profile } = useAuth();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const pointerId = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const offsetRef = useRef(0);
  const moved = useRef(false);

  const canDelete = isQueen;
  const canComplete = isSlave && canSwipeCompleteTask(task.status);
  const swipeEnabled = canDelete || canComplete;

  const overdue = isOverdue(task.deadline) && task.status !== "approved";
  const done = task.status === "approved";

  const cardClassName = cn(
    "group relative z-10 flex w-full items-start gap-3 rounded-lg border px-3 py-3 bg-charcoal/95 transition-colors duration-200 select-none touch-pan-y",
    overdue
      ? "border-red-500/35 bg-red-950/20"
      : done
        ? "border-emerald-500/20 bg-emerald-950/10"
        : "border-gold/10 bg-void/40"
  );

  const clampOffset = (dx: number) => {
    let next = dx;
    if (!canComplete) next = Math.min(0, next);
    if (!canDelete) next = Math.max(0, next);
    return Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, next));
  };

  const setDragOffset = (next: number) => {
    offsetRef.current = next;
    setOffset(next);
  };

  const resetSwipe = () => {
    pointerId.current = null;
    draggingRef.current = false;
    setDragging(false);
    setDragOffset(0);
    moved.current = false;
  };

  const releasePointer = (pointer: number) => {
    if (cardRef.current?.hasPointerCapture(pointer)) {
      cardRef.current.releasePointerCapture(pointer);
    }
  };

  const runDelete = async () => {
    setBusy(true);
    const supabase = createClient();
    const { error } = await deleteTask(supabase, task.id);
    setBusy(false);
    if (error) {
      toast.error("Could not delete task");
      return;
    }
    toast.success("Task removed");
    onAction?.();
  };

  const runComplete = async () => {
    if (!profile) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await markTaskComplete(
      supabase,
      task.id,
      profile.id,
      profile.role
    );
    setBusy(false);
    if (error) {
      toast.error("Could not mark complete");
      return;
    }
    toast.success("Marked complete — awaiting Queen's review");
    onAction?.();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled || busy || e.button !== 0) return;
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    moved.current = false;
    draggingRef.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId || !draggingRef.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (!moved.current && Math.abs(dx) < TAP_MOVE_PX && Math.abs(dy) < TAP_MOVE_PX) {
      return;
    }

    if (!moved.current && Math.abs(dy) > Math.abs(dx)) {
      releasePointer(e.pointerId);
      resetSwipe();
      return;
    }

    moved.current = true;
    e.preventDefault();
    setDragOffset(clampOffset(dx));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId) return;

    const dx = clampOffset(e.clientX - startX.current);
    releasePointer(e.pointerId);

    if (dx >= SWIPE_THRESHOLD && canComplete) {
      resetSwipe();
      void runComplete();
      return;
    }

    if (dx <= -SWIPE_THRESHOLD && canDelete) {
      resetSwipe();
      void runDelete();
      return;
    }

    const wasTap = !moved.current;
    resetSwipe();

    if (wasTap) {
      router.push(`/dashboard/task/${task.id}`);
    }
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId) return;
    releasePointer(e.pointerId);
    resetSwipe();
  };

  if (!swipeEnabled) {
    return (
      <Link
        href={`/dashboard/task/${task.id}`}
        className={cn(
          cardClassName,
          "hover:border-gold/30 hover:bg-void/70",
          overdue && "hover:border-red-500/55",
          done && "hover:border-emerald-500/40"
        )}
      >
        <TaskRowContent task={task} />
      </Link>
    );
  }

  const completeOpacity = canComplete
    ? Math.min(1, Math.max(0, offset / SWIPE_THRESHOLD))
    : 0;
  const deleteOpacity = canDelete
    ? Math.min(1, Math.max(0, -offset / SWIPE_THRESHOLD))
    : 0;

  return (
    <div className="relative overflow-hidden overscroll-x-none rounded-lg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-stretch"
      >
        <div
          className={cn(
            "flex w-28 shrink-0 items-center justify-center bg-emerald-700/90 transition-opacity",
            !canComplete && "opacity-0"
          )}
          style={{ opacity: completeOpacity }}
        >
          <CheckCircle2 className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1" />
        <div
          className={cn(
            "flex w-28 shrink-0 items-center justify-center bg-red-700/90 transition-opacity",
            !canDelete && "opacity-0"
          )}
          style={{ opacity: deleteOpacity }}
        >
          <Trash2 className="h-6 w-6 text-white" />
        </div>
      </div>

      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-label={`${task.title}. Swipe right to complete, swipe left to delete.`}
        className={cn(cardClassName, busy && "opacity-60")}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 200ms ease-out",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(`/dashboard/task/${task.id}`);
          }
        }}
      >
        <TaskRowContent task={task} />
      </div>
    </div>
  );
}
