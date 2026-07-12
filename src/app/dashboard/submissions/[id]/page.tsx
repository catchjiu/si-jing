"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { StatusBadge } from "@/components/tasks/status-badge";
import { MediaGallery } from "@/components/submissions/media-gallery";
import { ReviewActions } from "@/components/submissions/review-actions";
import { CommentThread } from "@/components/comments/comment-thread";
import { SubmissionForm } from "@/components/submissions/submission-form";
import { formatDeadline } from "@/lib/format";
import type { SubmissionWithRelations } from "@/lib/types";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { RoleSpeech } from "@/components/ui/role-speech";

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [submission, setSubmission] = useState<SubmissionWithRelations | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("submissions")
      .select("*, task:tasks(*), media:submission_media(*), submitter:users!submitted_by(*)")
      .eq("id", id)
      .single();

    setSubmission((data as SubmissionWithRelations | null) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!submission) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Submission not found.</p>
        <Link href="/dashboard" className="text-gold text-sm">
          Return to dashboard
        </Link>
      </div>
    );
  }

  const canResubmit =
    isSlave &&
    submission.submitted_by === profile?.id &&
    submission.status === "rejected" &&
    submission.task_id;

  return (
    <div className="space-y-8">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-ivory">Submission</h1>
          {submission.task && (
            <Link
              href={`/dashboard/task/${submission.task_id}`}
              className="mt-2 inline-block text-sm text-gold/80 hover:text-gold"
            >
              Task: {submission.task.title}
            </Link>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDeadline(submission.submitted_at)}
          </p>
        </div>
        <StatusBadge status={submission.status} type="submission" />
      </div>

      {submission.submission_text && (
        <div className="rounded-xl border border-gold/15 bg-charcoal/80 p-5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-ivory/90">
            <RoleSpeech
              text={submission.submission_text}
              role="slave"
            />
          </p>
        </div>
      )}

      {submission.feedback && (
        <div className="rounded-xl border border-gold/30 bg-royal/20 p-5">
          <p className="text-xs uppercase tracking-wider text-gold mb-2">
            Queen&apos;s feedback
          </p>
          <p className="text-sm text-ivory/90 whitespace-pre-wrap">
            <RoleSpeech text={submission.feedback} role="queen" />
          </p>
        </div>
      )}

      {submission.media && submission.media.length > 0 && (
        <MediaGallery media={submission.media} />
      )}

      {isQueen && submission.submitted_by && (
        <ReviewActions
          submissionId={submission.id}
          taskId={submission.task_id}
          recipientId={submission.submitted_by}
          currentStatus={submission.status}
          onReviewed={load}
        />
      )}

      {canResubmit && (
        <section className="space-y-4">
          <h2 className="font-heading text-xl text-gold">Resubmit</h2>
          <SubmissionForm taskId={submission.task_id} onSuccess={load} />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Comments</h2>
        <CommentThread submissionId={submission.id} />
      </section>

      <VoiceNotes entityType="submission" entityId={submission.id} />
    </div>
  );
}
