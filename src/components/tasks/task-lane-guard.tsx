"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  taskLaneFromSwitch,
  taskListHref,
  taskNewHref,
  type TaskLane,
} from "@/lib/task-lane";

export function TaskLaneGuard({
  lane,
  dest = "list",
  children,
}: {
  lane: TaskLane;
  dest?: "list" | "new";
  children: ReactNode;
}) {
  const router = useRouter();
  const { isSwitched, loading } = useAuth();
  const current = taskLaneFromSwitch(isSwitched);
  const mismatch = !loading && current !== lane;

  useEffect(() => {
    if (!mismatch) return;
    router.replace(
      dest === "new" ? taskNewHref(current) : taskListHref(current)
    );
  }, [mismatch, current, dest, router]);

  if (loading || mismatch) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return <>{children}</>;
}
