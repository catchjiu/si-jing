"use client";

import { TaskLaneGuard } from "@/components/tasks/task-lane-guard";
import { NewTaskView } from "@/components/tasks/new-task-view";

export default function SwitchNewTaskPage() {
  return (
    <TaskLaneGuard lane="switch" dest="new">
      <NewTaskView lane="switch" />
    </TaskLaneGuard>
  );
}
