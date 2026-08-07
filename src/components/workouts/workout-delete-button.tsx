"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { deleteWorkoutSession } from "@/lib/workout-persist";
import type { WorkoutSessionStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function deleteCopy(status?: WorkoutSessionStatus) {
  switch (status) {
    case "skipped":
      return {
        title: "Delete this rest day?",
        description:
          "This permanently removes the rest day entry from your workout history.",
      };
    case "planned":
      return {
        title: "Delete this planned workout?",
        description:
          "This permanently removes the plan, all sets, and any attached photos or video.",
      };
    case "in_progress":
      return {
        title: "Delete this workout in progress?",
        description:
          "This permanently removes the session, all logged sets, and any attached media.",
      };
    default:
      return {
        title: "Delete this workout?",
        description:
          "This permanently removes the session, all sets, media, and queen reactions.",
      };
  }
}

export function WorkoutDeleteButton({
  sessionId,
  status,
  onDeleted,
  className,
  size = "sm",
  variant = "ghost",
  showLabel = false,
}: {
  sessionId: string;
  status?: WorkoutSessionStatus;
  onDeleted?: () => void;
  className?: string;
  size?: "sm" | "icon-sm" | "icon";
  variant?: "ghost" | "outline";
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const copy = deleteCopy(status);

  const handleDelete = async () => {
    setDeleting(true);
    const supabase = createClient();
    try {
      await deleteWorkoutSession(supabase, sessionId);
      toast.success("Workout deleted");
      setOpen(false);
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete workout");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={deleting}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn("text-muted-foreground hover:text-red-300", className)}
        aria-label="Delete workout"
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {showLabel ? <span className="ml-1.5">Delete</span> : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-gold/20 bg-charcoal">
          <DialogHeader>
            <DialogTitle className="font-heading text-gold">
              {copy.title}
            </DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deleting}
              onClick={() => void handleDelete()}
              className="bg-red-700 text-white hover:bg-red-600"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
