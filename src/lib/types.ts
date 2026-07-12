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
export type PunishmentStatus = "pending" | "active" | "completed" | "lifted";

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

export type RequestMessage = {
  id: string;
  request_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export type VoiceEntityType =
  | "task"
  | "submission"
  | "request"
  | "comment"
  | "reward"
  | "punishment"
  | "check_in"
  | "tease"
  | "date";

export type VoiceNote = {
  id: string;
  created_by: string;
  entity_type: VoiceEntityType;
  entity_id: string;
  file_path: string;
  duration_ms: number | null;
  created_at: string;
};

export type ProtocolRule = {
  id: string;
  created_by: string;
  title: string;
  body: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RuleAcknowledgment = {
  id: string;
  rule_id: string;
  user_id: string;
  acknowledged_at: string;
};

export type CheckInStatus = "scheduled" | "open" | "completed" | "missed";

export type CheckIn = {
  id: string;
  created_by: string;
  assigned_to: string;
  title: string;
  prompt: string | null;
  window_minutes: number;
  opens_at: string;
  closes_at: string;
  status: CheckInStatus;
  response_text: string | null;
  responded_at: string | null;
  pending_punishment_id: string | null;
  created_at: string;
};

export type QueenDate = {
  id: string;
  created_by: string;
  assigned_to: string;
  title: string | null;
  notes: string | null;
  scheduled_at: string;
  thoughts_text: string | null;
  arousal_level: number | null;
  jealousy_level: number | null;
  youtube_url: string | null;
  reacted_at: string | null;
  created_at: string;
};

export type Tease = {
  id: string;
  sent_by: string;
  sent_to: string;
  title: string | null;
  message: string | null;
  image_path: string | null;
  unlocks_at: string;
  unlocked_notified_at: string | null;
  viewed_at: string | null;
  is_blurred: boolean;
  blur_amount: number;
  unblurred_at: string | null;
  view_duration_seconds: number | null;
  view_started_at: string | null;
  expired_at: string | null;
  screenshot_flagged_at: string | null;
  created_at: string;
};

export type TeaseUnlockTask = {
  id: string;
  tease_id: string;
  sort_order: number;
  label: string;
  completed_at: string | null;
  created_at: string;
};

export type TeaseWithSignedUrl = Tease & {
  signedUrl?: string;
  unlock_tasks?: TeaseUnlockTask[];
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
  pendingRequests: number;
  activePunishments: number;
  unackedRules: number;
  openCheckIns: number;
  pendingPunishments: number;
};

export type SlaveDashboardStats = {
  completionRate: number;
  streak: number;
  completed: number;
  total: number;
  completedTasks: number;
  activeTasks: number;
  unackedRules: number;
  lastRulesAckAt: string | null;
  openCheckIns: number;
  nextTeaseUnlockAt: string | null;
};

export type TaskFiltersState = {
  status: TaskStatus | "all";
  difficulty: DifficultyLevel | "all";
  search: string;
};
