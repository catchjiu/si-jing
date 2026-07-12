import type { Tables } from "@/lib/database.types";

export type UserRole = "queen" | "slave";

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected";

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type DifficultyLevel = "easy" | "medium" | "hard";

export type RecurrencePattern = "daily" | "weekly" | "monthly";

export type Profile = Omit<Tables<"users">, "role"> & {
  role: UserRole;
};

export type Task = Omit<
  Tables<"tasks">,
  "status" | "difficulty_level" | "recurrence_pattern"
> & {
  status: TaskStatus;
  difficulty_level: DifficultyLevel | null;
  recurrence_pattern: RecurrencePattern | null;
  parent_task_id?: string | null;
  occurrence_key?: string | null;
};

export type Submission = Omit<Tables<"submissions">, "status"> & {
  status: SubmissionStatus;
};

export type SubmissionMedia = Tables<"submission_media">;
export type Comment = Tables<"comments">;

export type Reward = {
  id: string;
  sent_by: string;
  sent_to: string;
  title: string | null;
  message: string | null;
  image_path: string;
  task_id: string | null;
  submission_id: string | null;
  viewed_at: string | null;
  created_at: string;
};

export type RewardWithSignedUrl = Reward & {
  signedUrl?: string;
};

export type PunishmentType = "contact_restriction" | "custom";
export type PunishmentStatus = "active" | "completed" | "lifted";

export type Punishment = {
  id: string;
  issued_by: string;
  issued_to: string;
  punishment_type: PunishmentType;
  title: string | null;
  reason: string | null;
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
  status: PunishmentStatus;
  lifted_at: string | null;
  created_at: string;
};

export type RequestType = "contact" | "mercy" | "reward" | "general";
export type RequestStatus = "pending" | "approved" | "denied" | "withdrawn";

export type DesireRequest = {
  id: string;
  requested_by: string;
  request_type: RequestType;
  title: string;
  message: string | null;
  desire_level: number;
  status: RequestStatus;
  queen_response: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskWithRelations = Task & {
  assignee?: Profile | null;
  assigner?: Profile | null;
  submissions?: Submission[];
  submission_count?: number;
};

export type SubmissionWithRelations = Submission & {
  task?: Task | null;
  submitter?: Profile | null;
  media?: SubmissionMedia[];
  comments?: (Comment & { author?: Profile | null })[];
};

export type CommentWithAuthor = Comment & {
  author?: Profile | null;
  replies?: CommentWithAuthor[];
};

export type DashboardStats = {
  tasksAssigned: number;
  pendingSubmissions: number;
  completionRate: number;
  activeTasks: number;
  completedTasks: number;
  streak: number;
};

export type QueenDashboardStats = {
  tasksAssigned: number;
  pendingSubmissions: number;
  completionRate: number;
};

export type SlaveDashboardStats = {
  completionRate: number;
  streak: number;
  completed: number;
  total: number;
  completedTasks: number;
  activeTasks: number;
};

export type TaskFiltersState = {
  status: TaskStatus | "all";
  difficulty: DifficultyLevel | "all";
  search: string;
};
