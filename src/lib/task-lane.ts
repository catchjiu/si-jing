export type TaskLane = "home" | "switch";

export function isTaskLane(value: unknown): value is TaskLane {
  return value === "home" || value === "switch";
}

export function taskLaneOf(task: { lane?: string | null }): TaskLane {
  return task.lane === "switch" ? "switch" : "home";
}

export function taskLaneFromSwitch(switched: boolean): TaskLane {
  return switched ? "switch" : "home";
}

export function taskListHref(lane: TaskLane): string {
  return lane === "switch" ? "/dashboard/switch/tasks" : "/dashboard/tasks";
}

export function taskNewHref(lane: TaskLane): string {
  return lane === "switch" ? "/dashboard/switch/tasks/new" : "/dashboard/tasks/new";
}

export function taskDetailHref(
  taskId: string,
  lane?: TaskLane | string | null
): string {
  return lane === "switch"
    ? `/dashboard/switch/task/${taskId}`
    : `/dashboard/task/${taskId}`;
}

export function taskEditHref(
  taskId: string,
  lane?: TaskLane | string | null
): string {
  return `${taskDetailHref(taskId, lane)}/edit`;
}
