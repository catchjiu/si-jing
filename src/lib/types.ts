import type { Tables } from "@/lib/database.types";
import type { WorkoutBodyPart } from "@/lib/workout-exercises";

export type UserRole = "queen" | "slave";

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "failed";

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
  punishment_id?: string | null;
  started_at?: string | null;
};

export type Submission = Omit<Tables<"submissions">, "status"> & {
  status: SubmissionStatus;
};

export type SubmissionMedia = Tables<"submission_media">;
export type Comment = Tables<"comments">;

export type ImageLocationSource = "exif" | "device";

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
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  location_source: ImageLocationSource | null;
};

export type RewardWithSignedUrl = Reward & {
  signedUrl?: string;
};

export type WishlistStatus =
  | "new"
  | "seen"
  | "idea"
  | "ordered"
  | "fulfilled"
  | "revealed";
export type WishlistItemKind = "queen_taste" | "slave_gift";

export type WishlistItem = {
  id: string;
  created_by: string;
  item_kind: WishlistItemKind;
  title: string | null;
  notes: string | null;
  link_url: string | null;
  image_path: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  location_source: ImageLocationSource | null;
  created_at: string;
  status: WishlistStatus;
  seen_at: string | null;
  fulfillment_notes: string | null;
  fulfilled_at: string | null;
  purchase_price_usd?: number | null;
  purchased_at?: string | null;
  arrived_at?: string | null;
  /** Queen's 1–5 star rating for revealed gifts. */
  queen_rating?: number | null;
  queen_rated_at?: string | null;
  /** Short Queen feedback next to the star rating. */
  queen_rating_comment?: string | null;
  /** True when Queen cannot view gift details yet. */
  is_secret?: boolean;
};

export type WishlistItemWithSignedUrl = WishlistItem & {
  signedUrl?: string;
};

export type QueenSizeChartDraft = {
  height: string;
  bust: string;
  waist: string;
  hips: string;
  dress_size: string;
  top_size: string;
  bottom_size: string;
  bra_size: string;
  underwear_size: string;
  shoe_size: string;
  ring_size: string;
  notes: string;
};

export type QueenSizeChart = QueenSizeChartDraft & {
  user_id: string;
  updated_at: string;
};

export type WorshipMediaKind = "image" | "video";

export type WorshipEntrySourceType = "upload" | "reward" | "tease";

export type WorshipEntry = {
  id: string;
  gallery_id: string;
  created_by: string;
  title: string | null;
  description: string | null;
  image_path: string;
  media_kind: WorshipMediaKind;
  storage_bucket: string;
  source_type: WorshipEntrySourceType | null;
  source_id: string | null;
  love_level: number;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  location_source: ImageLocationSource | null;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorshipEntryWithSignedUrl = WorshipEntry & {
  signedUrl?: string;
};

export type WorshipGalleryTopic = {
  id: string;
  created_by: string;
  topic: string;
  description: string | null;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorshipGalleryTopicWithMeta = WorshipGalleryTopic & {
  coverSignedUrl?: string;
  coverMediaKind?: WorshipMediaKind;
  entryCount: number;
  unviewedCount: number;
  avgLoveLevel: number | null;
};

export type PunishmentType =
  | "contact_restriction"
  | "custom"
  | "task_debt"
  | "date_timeout"
  | "orgasm_ban"
  | "privilege_freeze";

export type PunishmentStatus = "pending" | "active" | "completed" | "lifted";
export type PunishmentClearanceMode = "timed" | "task_debt";

export type PunishmentConfig = {
  tasks_required?: number;
  require_check_in?: boolean;
  task_titles?: string[];
};

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
  config: PunishmentConfig;
  acknowledged_at: string | null;
  clearance_mode: PunishmentClearanceMode;
};

export type RequestType =
  | "contact"
  | "mercy"
  | "reward"
  | "general"
  | "orgasm"
  | "directive"
  | "question";
export type RequestStatus = "pending" | "approved" | "denied" | "withdrawn";
export type RequestDirection = "petition" | "directive";

export type DesireRequest = {
  id: string;
  requested_by: string;
  request_type: RequestType;
  title: string;
  message: string | null;
  image_path: string | null;
  desire_level: number;
  status: RequestStatus;
  queen_response: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  direction: RequestDirection;
  assigned_to: string | null;
  slave_response: string | null;
  slave_responded_at: string | null;
};

export type RequestMessage = {
  id: string;
  request_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export type MessageAttachmentType =
  | "tease"
  | "task"
  | "punishment"
  | "reward"
  | "request"
  | "date"
  | "journal"
  | "submission"
  | "wishlist"
  | "worship"
  | "worship_assignment"
  | "denial";
export type MessageMediaType = "image" | "video";

export type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_path: string | null;
  media_type: MessageMediaType | null;
  voice_path: string | null;
  voice_duration_ms: number | null;
  attachment_type: MessageAttachmentType | null;
  attachment_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type AppNotification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
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
  | "date"
  | "journal"
  | "wishlist"
  | "worship"
  | "worship_gallery";

export type StreakMilestone = {
  id: string;
  created_by: string;
  target_days: number;
  title: string;
  description: string | null;
  reward_suggestion: string | null;
  sort_order: number;
  created_at: string;
};

export type StreakMilestoneAward = {
  id: string;
  milestone_id: string;
  awarded_at: string;
  streak_at_award: number;
};

export type JournalVisibility = "private" | "shared";

export type JournalEntry = {
  id: string;
  author_id: string;
  body: string;
  visibility: JournalVisibility;
  entry_date: string;
  created_at: string;
  updated_at: string;
  image_path?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_m?: number | null;
  location_source?: ImageLocationSource | null;
};

export type JournalEntryImage = {
  id: string;
  entry_id: string;
  image_path: string;
  sort_order: number;
  taken_at: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_m?: number | null;
  location_source?: ImageLocationSource | null;
  created_at: string;
};

export type JournalEntryImageWithSignedUrl = JournalEntryImage & {
  signedUrl?: string;
};

export type JournalEntryWithSignedUrl = JournalEntry & {
  signedUrl?: string;
  images?: JournalEntryImageWithSignedUrl[];
};

export type JournalComment = {
  id: string;
  entry_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export type QueenAvailability =
  | "working"
  | "busy"
  | "dating"
  | "available"
  | "no_contact";

export type UserStatus = {
  user_id: string;
  mood_level: number;
  mood_emoji: string;
  availability?: QueenAvailability | null;
  last_active_at?: string | null;
  updated_at: string;
};

export type WorshipAssignmentStatus =
  | "open"
  | "completed"
  | "cancelled"
  | "overdue";

export type WorshipAssignment = {
  id: string;
  assigned_by: string;
  assigned_to: string;
  gallery_id: string | null;
  topic: string;
  description: string | null;
  min_entries: number;
  due_at: string;
  status: WorshipAssignmentStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

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

export type FlirtStatus = "looked" | "chatting" | "fucked";

export const FLIRT_DICK_SIZE_MIN_CM = 5;
export const FLIRT_DICK_SIZE_MAX_CM = 30;

export type FlirtGuy = {
  id: string;
  created_by: string;
  assigned_to: string;
  name: string;
  photo_path: string | null;
  status: FlirtStatus;
  interest_level: number;
  hotness_level: number;
  jealousy_level: number;
  face_score: number;
  body_score: number;
  dick_size_cm: number;
  /** Special card for D — body_score mirrors current progress-pic rating */
  is_slave?: boolean;
  created_at: string;
  updated_at: string;
};

export type FlirtGuyWithSignedUrl = FlirtGuy & {
  signedUrl?: string;
};

export type FlirtEntryMediaKind = "text" | "image";

export type FlirtEntry = {
  id: string;
  guy_id: string;
  author_id: string;
  body: string | null;
  media_kind: FlirtEntryMediaKind;
  file_path: string | null;
  entry_date: string;
  created_at: string;
};

export type FlirtEntryWithSignedUrl = FlirtEntry & {
  signedUrl?: string;
};

export type FlirtMessage = {
  id: string;
  guy_id: string;
  author_id: string;
  content: string | null;
  image_path: string | null;
  created_at: string;
};

export type { WorkoutBodyPart };

export type BodyRatings = {
  id: string;
  rated_by: string;
  rated_for: string;
  overall: number;
  arms: number;
  shoulders: number;
  chest: number;
  abs: number;
  back: number;
  butt: number;
  updated_at: string;
};

export type BodyRatingSnapshot = {
  id: string;
  rated_by: string;
  rated_for: string;
  overall: number;
  arms: number;
  shoulders: number;
  chest: number;
  abs: number;
  back: number;
  butt: number;
  week_start: string;
  rated_at: string;
  weekly_pic_id?: string | null;
};

export type JealousyMissionSourceType =
  | "flirt_guy"
  | "queen_date"
  | "outfit_veto";
export type JealousyMissionStatus = "open" | "completed" | "cancelled";

export type JealousyMission = {
  id: string;
  created_by: string;
  assigned_to: string;
  source_type: JealousyMissionSourceType;
  source_id: string;
  source_label: string | null;
  prompt: string;
  status: JealousyMissionStatus;
  response_text: string | null;
  completed_at: string | null;
  denial_days: number;
  edge_debt: number;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JealousyOutfitVetoStatus = "open" | "ranked" | "cancelled";

export type JealousyOutfitOption = {
  id: string;
  image_path: string;
  label?: string | null;
};

export type JealousyOutfitVeto = {
  id: string;
  created_by: string;
  assigned_to: string;
  status: JealousyOutfitVetoStatus;
  purpose: string;
  options: JealousyOutfitOption[];
  slave_rank_order: string[] | null;
  winning_option_id: string | null;
  mission_id: string | null;
  prompt_template: string;
  denial_days: number;
  edge_debt: number;
  created_at: string;
  updated_at: string;
};

export type JealousyOutfitVetoWithUrls = Omit<JealousyOutfitVeto, "options"> & {
  options: (JealousyOutfitOption & { signedUrl?: string })[];
};

export type JealousyMissionComment = {
  id: string;
  mission_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Pick<Profile, "id" | "username" | "role"> | null;
};

export type BodyInspectionStatus =
  | "open"
  | "awaiting_rating"
  | "reviewed"
  | "complete";

export type BodyInspection = {
  id: string;
  slave_id: string;
  week_start: string;
  status: BodyInspectionStatus;
  inspection_score: number | null;
  queen_note: string | null;
  reply_allowed: boolean;
  slave_reply: string | null;
  slave_replied_at: string | null;
  queen_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutSessionStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "skipped";

export type WorkoutSession = {
  id: string;
  created_by: string;
  assigned_to: string;
  performed_at: string;
  notes: string | null;
  started_at: string | null;
  ended_at: string | null;
  /** Manual session length; preferred over started/ended delta */
  duration_minutes: number | null;
  status: WorkoutSessionStatus;
  queen_impressed: number | null;
  queen_note: string | null;
  queen_reacted_at: string | null;
  created_at: string;
};

export type WorkoutSet = {
  id: string;
  session_id: string;
  body_part: WorkoutBodyPart;
  exercise_name: string;
  set_number: number;
  reps: number;
  weight: number;
  unit: string;
  sort_order: number;
  is_pr: boolean;
  created_at: string;
};

export type WorkoutMedia = {
  id: string;
  session_id: string;
  media_kind: "image" | "video";
  file_path: string;
  created_at: string;
};

export type WorkoutWeeklyPic = {
  id: string;
  created_by: string;
  /** Monday of the week (one photo per week) */
  week_start: string;
  /** Calendar date the photo was taken */
  taken_on: string | null;
  file_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Body rating attached to this progress pic (null until Queen rates it) */
  rating_overall: number | null;
  rating_arms: number | null;
  rating_shoulders: number | null;
  rating_chest: number | null;
  rating_abs: number | null;
  rating_back: number | null;
  rating_butt: number | null;
  rated_by: string | null;
  rated_at: string | null;
};

export const FLIRT_STATUS_LABELS: Record<FlirtStatus, string> = {
  looked: "Looked",
  chatting: "Chatted/Texting",
  fucked: "Fucked",
};

export const FLIRT_STATUSES: FlirtStatus[] = [
  "looked",
  "chatting",
  "fucked",
];

export type EvidencePinSourceType =
  | "date"
  | "tease"
  | "voice_note"
  | "date_post"
  | "direct_message"
  | "worship_message"
  | "worship_gallery_message";
export type EvidencePinMediaKind =
  | "youtube"
  | "image"
  | "voice"
  | "reaction"
  | "video"
  | "text";

export type EvidencePin = {
  id: string;
  pinned_by: string;
  source_type: EvidencePinSourceType;
  source_id: string;
  media_kind: EvidencePinMediaKind;
  title: string;
  caption: string | null;
  youtube_url: string | null;
  file_path: string | null;
  storage_bucket:
    | "teases"
    | "voice"
    | "submissions"
    | "date_posts"
    | "messages"
    | "worship"
    | null;
  meta: Record<string, unknown> | null;
  pinned_at: string;
};

export type DatePostMediaKind = "text" | "image" | "video" | "youtube";
export type DatePostLocationSource = ImageLocationSource;

export type DatePost = {
  id: string;
  date_id: string;
  author_id: string;
  body: string | null;
  media_kind: DatePostMediaKind;
  file_path: string | null;
  youtube_url: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  location_source: DatePostLocationSource | null;
};

export type DatePostWithSignedUrl = DatePost & {
  signedUrl?: string;
};

export type LocationRequestStatus =
  | "pending"
  | "shared"
  | "declined"
  | "cancelled";

export type LocationRequest = {
  id: string;
  requested_by: string;
  requested_from: string;
  status: LocationRequestStatus;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  shared_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TeaseMediaKind = "image" | "video";
export type TeasePremiereKind = "burned" | "timed";
export type TeaseBurnReason =
  | "played"
  | "early_exit"
  | "looked_away"
  | "missed_window";

export type Tease = {
  id: string;
  sent_by: string;
  sent_to: string;
  title: string | null;
  message: string | null;
  image_path: string | null;
  media_kind: TeaseMediaKind;
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
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  location_source: ImageLocationSource | null;
  reaction_score: number | null;
  reacted_at: string | null;
  view_count: number;
  premiere_kind: TeasePremiereKind | null;
  premiere_window_minutes: number | null;
  premiere_closes_at: string | null;
  premiere_denial_days: number;
  burned_at: string | null;
  burn_reason: TeaseBurnReason | null;
};

export type TeaseUnlockTask = {
  id: string;
  tease_id: string;
  sort_order: number;
  label: string;
  completed_at: string | null;
  created_at: string;
};

export type TeaseViewCapture = {
  id: string;
  tease_id: string;
  viewer_id: string;
  video_path: string;
  duration_ms: number | null;
  watch_metric: number | null;
  created_at: string;
};

export type TeaseWithSignedUrl = Tease & {
  signedUrl?: string;
  unlock_tasks?: TeaseUnlockTask[];
  view_captures?: TeaseViewCapture[];
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
  completedToday: number;
  totalToday: number;
  streak: number;
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
