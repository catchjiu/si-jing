"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { TaskForm } from "@/components/tasks/task-form";
import type { Task } from "@/lib/types";

export default function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { isQueen, loading: authLoading } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!authLoading && !isQueen) {
      router.replace("/dashboard");
    }
  }, [isQueen, authLoading, router]);

  useEffect(() => {
    if (!id || !isQueen) return;
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id)
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
  }, [id, isQueen]);

  if (authLoading || loading || !isQueen) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (missing || !task) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/tasks"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" />
          Tasks
        </Link>
        <p className="text-sm text-muted-foreground">Task not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/dashboard/task/${task.id}`}
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
        onSuccess={() => {
          router.push(`/dashboard/task/${task.id}`);
          router.refresh();
        }}
      />
    </div>
  );
}
