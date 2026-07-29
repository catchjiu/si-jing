import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TaskStatus, UserRole } from "@/lib/types";
import { formatRoleSpeech } from "@/lib/role-speech";

type Client = SupabaseClient<Database>;

export async function deleteTask(
  supabase: Client,
  taskId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  return { error: error?.message ?? null };
}

const COMPLETABLE_STATUSES: TaskStatus[] = [
  "pending",
  "in_progress",
  "rejected",
];

export function canSwipeCompleteTask(status: TaskStatus): boolean {
  return COMPLETABLE_STATUSES.includes(status);
}

export async function markTaskComplete(
  supabase: Client,
  taskId: string,
  userId: string,
  role: UserRole
): Promise<{ error: string | null }> {
  const submissionText = formatRoleSpeech(
    "Completed without evidence",
    role
  );

  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .insert({
      task_id: taskId,
      submitted_by: userId,
      submission_text: submissionText,
      status: "pending",
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    return { error: submissionError?.message ?? "Could not create submission" };
  }

  const { error: taskError } = await supabase
    .from("tasks")
    .update({
      status: "submitted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  return { error: taskError?.message ?? null };
}
