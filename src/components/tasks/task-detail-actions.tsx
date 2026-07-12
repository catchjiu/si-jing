"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function TaskDetailActions({ task }: { task: Task }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const onDelete = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    setLoading(false);
    if (error) {
      toast.error("Could not delete task");
      return;
    }
    toast.success("Task removed");
    setOpen(false);
    router.push("/dashboard/tasks");
    router.refresh();
  };

  return (
    <div className="flex flex-wrap gap-2 border-t border-gold/10 pt-4">
      <Button
        asChild
        variant="outline"
        className="border-gold/40 text-gold hover:bg-gold/10"
      >
        <Link href={`/dashboard/task/${task.id}/edit`}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit task
        </Link>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="border-red-500/40 text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete task
          </Button>
        </DialogTrigger>
        <DialogContent className="border-gold/20 bg-charcoal">
          <DialogHeader>
            <DialogTitle className="font-heading text-gold">
              Delete this task?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the task and all submissions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onDelete}
              disabled={loading}
              className="bg-red-700 text-white hover:bg-red-600"
            >
              {loading ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
