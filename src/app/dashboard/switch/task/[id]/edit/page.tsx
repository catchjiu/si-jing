"use client";

import { TaskLaneGuard } from "@/components/tasks/task-lane-guard";
import { EditTaskPageClient } from "@/components/tasks/edit-task-view";

export default function SwitchEditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <TaskLaneGuard lane="switch">
      <EditTaskPageClient params={params} lane="switch" />
    </TaskLaneGuard>
  );
}
