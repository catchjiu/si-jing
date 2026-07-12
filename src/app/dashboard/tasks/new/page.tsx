"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { TaskForm } from "@/components/tasks/task-form";
import type { Profile } from "@/lib/types";

export default function NewTaskPage() {
  const router = useRouter();
  const { isQueen, loading } = useAuth();
  const [slave, setSlave] = useState<Profile | null>(null);

  useEffect(() => {
    if (!loading && !isQueen) {
      router.replace("/dashboard");
    }
  }, [isQueen, loading, router]);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      setSlave((data as Profile | null) ?? null);
    };
    void load();
  }, []);

  if (loading || !isQueen) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (!slave) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/tasks"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="rounded-xl border border-gold/20 bg-charcoal p-8">
          <h1 className="font-heading text-2xl text-gold mb-2">No subject yet</h1>
          <p className="text-sm text-muted-foreground">
            Create the slave account in Supabase Auth first (with user metadata
            role: slave, username: D), then return here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/dashboard/tasks"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tasks
      </Link>
      <div>
        <h1 className="font-heading text-3xl text-ivory">Assign a Task</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Issuing to {slave.username}
        </p>
      </div>
      <TaskForm
        assigneeId={slave.id}
        onSuccess={() => router.push("/dashboard/tasks")}
      />
    </div>
  );
}
