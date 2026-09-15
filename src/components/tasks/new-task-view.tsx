"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { TaskForm } from "@/components/tasks/task-form";
import type { Profile } from "@/lib/types";
import { taskListHref, type TaskLane } from "@/lib/task-lane";

export function NewTaskView({ lane }: { lane: TaskLane }) {
  const router = useRouter();
  const { isQueen, loading } = useAuth();
  const [assignee, setAssignee] = useState<Profile | null>(null);

  useEffect(() => {
    if (!loading && !isQueen) {
      router.replace(taskListHref(lane));
    }
  }, [isQueen, loading, router, lane]);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const homeRole = lane === "switch" ? "queen" : "slave";
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("home_role", homeRole)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      setAssignee((data as Profile | null) ?? null);
    };
    void load();
  }, [lane]);

  if (loading || !isQueen) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  const listHref = taskListHref(lane);
  const isSwitch = lane === "switch";

  if (!assignee) {
    return (
      <div className="space-y-4">
        <Link
          href={listHref}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="rounded-xl border border-gold/20 bg-charcoal p-8">
          <h1 className="font-heading mb-2 text-2xl text-gold">
            {isSwitch ? "No slut yet" : "No subject yet"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSwitch
              ? "The Queen account (slut in switch mode) must exist first."
              : "Create the slave account in Supabase Auth first (with user metadata role: slave, username: D), then return here."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={listHref}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tasks
      </Link>
      <div>
        <h1 className="font-heading text-3xl text-ivory">
          {isSwitch ? "Assign a duty" : "Assign a Task"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSwitch
            ? `Daddy issuing to slut (${assignee.username})`
            : `Issuing to ${assignee.username}`}
        </p>
      </div>
      <TaskForm
        assigneeId={assignee.id}
        lane={lane}
        onSuccess={() => router.push(listHref)}
      />
    </div>
  );
}
