"use client";

import { TaskLaneGuard } from "@/components/tasks/task-lane-guard";
import { TasksBoard } from "@/components/tasks/tasks-board";

export default function SwitchTasksPage() {
  return (
    <TaskLaneGuard lane="switch">
      <TasksBoard lane="switch" />
    </TaskLaneGuard>
  );
}
