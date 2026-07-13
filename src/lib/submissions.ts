import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { SubmissionWithRelations } from "@/lib/types";
import { removeObject } from "@/lib/storage/client";

type Client = SupabaseClient<Database>;

export async function deleteSubmission(
  supabase: Client,
  submission: SubmissionWithRelations
): Promise<void> {
  const media = submission.media ?? [];

  for (const item of media) {
    if (item.file_path) {
      try {
        await removeObject({ bucket: "submissions", path: item.file_path });
      } catch {
        // Best-effort storage cleanup
      }
    }
  }

  await supabase.from("comments").delete().eq("submission_id", submission.id);
  await supabase
    .from("voice_notes")
    .delete()
    .eq("entity_type", "submission")
    .eq("entity_id", submission.id);

  await supabase
    .from("submission_media")
    .delete()
    .eq("submission_id", submission.id);

  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", submission.id);

  if (error) throw error;

  const { data: remaining } = await supabase
    .from("submissions")
    .select("id")
    .eq("task_id", submission.task_id);

  if ((remaining ?? []).length === 0) {
    const { data: task } = await supabase
      .from("tasks")
      .select("started_at, status")
      .eq("id", submission.task_id)
      .single();

    if (task && ["submitted", "rejected"].includes(task.status)) {
      const nextStatus = task.started_at ? "in_progress" : "pending";
      await supabase
        .from("tasks")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submission.task_id);
    }
  }
}
