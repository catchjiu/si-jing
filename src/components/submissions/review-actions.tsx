"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Check, Gift, Loader2, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { SubmissionStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { RewardForm } from "@/components/rewards/reward-form"

interface ReviewActionsProps {
  submissionId: string
  taskId: string
  recipientId: string
  currentStatus: SubmissionStatus
  onReviewed?: () => void
  className?: string
}

export function ReviewActions({
  submissionId,
  taskId,
  recipientId,
  currentStatus,
  onReviewed,
  className,
}: ReviewActionsProps) {
  const [feedback, setFeedback] = useState("")
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null)
  const [showReward, setShowReward] = useState(false)

  async function handleReview(decision: "approved" | "rejected") {
    setSubmitting(decision === "approved" ? "approve" : "reject")
    const supabase = createClient()

    try {
      const { error: submissionError } = await supabase
        .from("submissions")
        .update({
          status: decision,
          feedback: feedback.trim() || null,
        })
        .eq("id", submissionId)

      if (submissionError) throw submissionError

      const taskStatus = decision === "approved" ? "approved" : "rejected"
      const { error: taskError } = await supabase
        .from("tasks")
        .update({ status: taskStatus, updated_at: new Date().toISOString() })
        .eq("id", taskId)

      if (taskError) throw taskError

      if (feedback.trim()) {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          await supabase.from("comments").insert({
            submission_id: submissionId,
            commented_by: user.id,
            content: feedback.trim(),
            parent_id: null,
          })
        }
      }

      toast.success(
        decision === "approved" ? "Submission approved" : "Submission rejected"
      )
      setFeedback("")
      if (decision === "approved") setShowReward(true)
      onReviewed?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Review failed"
      toast.error(message)
    } finally {
      setSubmitting(null)
    }
  }

  const isPending = currentStatus === "pending"
  const canReward = currentStatus === "approved" || showReward

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-4 rounded-xl border border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--charcoal,#1a1a1a)] p-6">
        <div>
          <h3 className="font-heading text-lg text-[color:var(--white,#f5f5f5)]">
            Review Submission
          </h3>
          {!isPending && (
            <p className="mt-1 text-sm text-[color:var(--white,#f5f5f5)]/50">
              Currently marked as{" "}
              <span className="text-[color:var(--gold,#d4af37)]">
                {currentStatus}
              </span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="feedback">Feedback (optional)</Label>
          <Textarea
            id="feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Leave guidance or praise..."
            rows={3}
            className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => handleReview("approved")}
            disabled={submitting !== null}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {submitting === "approve" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Check className="mr-2 size-4" />
            )}
            Approve
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleReview("rejected")}
            disabled={submitting !== null}
          >
            {submitting === "reject" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <X className="mr-2 size-4" />
            )}
            Reject
          </Button>
          {canReward && !showReward && (
            <Button
              variant="outline"
              onClick={() => setShowReward(true)}
              className="border-gold/40 text-gold hover:bg-gold/10"
            >
              <Gift className="mr-2 size-4" />
              Send reward
            </Button>
          )}
        </div>
      </div>

      {showReward && (
        <RewardForm
          recipientId={recipientId}
          taskId={taskId}
          submissionId={submissionId}
          compact
          onSuccess={() => setShowReward(false)}
        />
      )}
    </div>
  )
}
