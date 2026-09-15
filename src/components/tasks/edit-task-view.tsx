"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { TaskForm } from "@/components/tasks/task-form";
import type { Task } from "@/lib/types";
import {
  taskDetailHref,
  taskLaneOf,
  taskListHref,
  type TaskLane,
} from "@/lib/task-lane";

export function EditTaskView({
  id,
  lane,
}: {
  id: string;
  lane: TaskLane;
}) {
  const router = useRouter();
  const { isQueen, loading: authLoading } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!authLoading && !isQueen) {
      router.replace(taskListHref(lane));
    }
  }, [isQueen, authLoading, router, lane]);

  useEffect(() => {
    if (!id || !isQueen) return;
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id)
        .eq("lane", lane)
        .maybeSingle();
      if (error || !data) {
        setMissing(true);
        setTask(null);
      } else {
        setTask(data as Task);
        setMissing(false);
      }
      setLoading(false);
    };
    void load();
  }, [id, isQueen, lane]);

  if (authLoading || loading || !isQueen) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (missing || !task) {
    return (
      <div className="space-y-4">
        <Link
          href={taskListHref(lane)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" />
          Tasks
        </Link>
        <p className="text-sm text-muted-foreground">Task not found.</p>
      </div>
    );
  }

  const taskLane = taskLaneOf(task);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={taskDetailHref(task.id, taskLane)}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to task
      </Link>
      <div>
        <h1 className="font-heading text-3xl text-ivory">Edit task</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update title, deadline, difficulty, or recurrence
        </p>
      </div>
      <TaskForm
        assigneeId={task.assigned_to}
        task={task}
        lane={taskLane}
        onSuccess={() => {
          router.push(taskDetailHref(task.id, taskLane));
          router.refresh();
        }}
      />
    </div>
  );
}

export function EditTaskPageClient({
  params,
  lane,
}: {
  params: Promise<{ id: string }>;
  lane: TaskLane;
}) {
  const { id } = use(params);
  return <EditTaskView id={id} lane={lane} />;
}
