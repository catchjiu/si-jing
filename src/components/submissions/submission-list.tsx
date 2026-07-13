"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { deleteSubmission } from "@/lib/submissions";
import { formatDeadline } from "@/lib/format";
import type { SubmissionWithRelations } from "@/lib/types";
import { StatusBadge } from "@/components/tasks/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SubmissionListProps {
  submissions: SubmissionWithRelations[];
  canDelete?: boolean;
}

export function SubmissionList({
  submissions: initialSubmissions,
  canDelete = false,
}: SubmissionListProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSubmissions(initialSubmissions);
  }, [initialSubmissions]);

  const onDelete = async () => {
    if (!pendingId || !profile) return;

    const submission = submissions.find((s) => s.id === pendingId);
    if (!submission) return;

    if (submission.submitted_by !== profile.id) {
      toast.error("You can only delete your own submissions");
      return;
    }

    if (!["pending", "rejected"].includes(submission.status)) {
      toast.error("Only submissions awaiting review can be deleted");
      return;
    }

    setDeleting(true);
    try {
      const supabase = createClient();
      await deleteSubmission(supabase, submission);
      setSubmissions((prev) => prev.filter((s) => s.id !== pendingId));
      toast.success("Submission deleted");
      setPendingId(null);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not delete submission";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  if (submissions.length === 0) {
    return <p className="text-sm text-muted-foreground">No submissions yet.</p>;
  }

  return (
    <>
      <ul className="space-y-3">
        {submissions.map((s) => {
          const own = profile?.id === s.submitted_by;
          const deletable =
            canDelete &&
            own &&
            ["pending", "rejected"].includes(s.status);

          return (
            <li key={s.id}>
              <div className="flex items-center gap-2 rounded-lg border border-gold/10 bg-void/40 px-4 py-3 transition-colors hover:border-gold/30">
                <Link
                  href={`/dashboard/submissions/${s.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ivory">
                      {s.submission_text?.slice(0, 80) || "Submission"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDeadline(s.submitted_at)}
                    </p>
                  </div>
                  <StatusBadge status={s.status} type="submission" />
                </Link>
                {deletable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Delete submission"
                    onClick={() => setPendingId(s.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && setPendingId(null)}
      >
        <DialogContent className="border-gold/20 bg-charcoal">
          <DialogHeader>
            <DialogTitle className="font-heading text-gold">
              Delete this submission?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the submission and any attached images or
              videos. The Queen will no longer see it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void onDelete()}
              disabled={deleting}
              className="bg-red-700 text-white hover:bg-red-600"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
