"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { TaskFilters } from "@/components/tasks/task-filters";
import { DayAgenda } from "@/components/tasks/day-agenda";
import { Button } from "@/components/ui/button";
import {
  ensureRecurringOccurrences,
  filterListableTasks,
} from "@/lib/tasks";
import type { Task, TaskFiltersState } from "@/lib/types";

export default function TasksPage() {
  const { isQueen, profile, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TaskFiltersState>({
    status: "all",
    difficulty: "all",
    search: "",
  });

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    await ensureRecurringOccurrences(supabase, 7);

    let query = supabase.from("tasks").select("*").order("deadline", {
      ascending: true,
    });

    if (!isQueen) {
      query = query.eq("assigned_to", profile.id);
    }

    const { data } = await query;
    setTasks(filterListableTasks((data ?? []) as Task[]));
    setLoading(false);
  }, [isQueen, profile]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filters.status !== "all" && t.status !== filters.status) return false;
      if (
        filters.difficulty !== "all" &&
        t.difficulty_level !== filters.difficulty
      )
        return false;
      if (
        filters.search &&
        !`${t.title} ${t.description ?? ""}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [tasks, filters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl text-ivory">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Day-by-day schedule · daily & weekly duties appear each period
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void load()}
            className="border-gold/30 text-gold hover:bg-gold/10"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {isQueen && (
            <Button asChild className="bg-gold text-void hover:bg-gold-muted">
              <Link href="/dashboard/tasks/new">
                <Plus className="mr-2 h-4 w-4" />
                Assign Task
              </Link>
            </Button>
          )}
        </div>
      </div>

      <TaskFilters filters={filters} onChange={setFilters} />

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading tasks…</p>
      ) : (
        <DayAgenda
          tasks={filtered}
          activeOnly={filters.status === "all"}
        />
      )}
    </div>
  );
}
