"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import type { DifficultyLevel, RecurrencePattern, Task } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const taskSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200),
    description: z.string().max(2000).optional(),
    deadline: z.string().min(1, "Deadline is required"),
    difficulty_level: z.enum(["easy", "medium", "hard"]),
    is_recurring: z.boolean(),
    recurrence_pattern: z.enum(["daily", "weekly", "monthly"]).optional().nullable(),
  })
  .refine(
    (data) => !data.is_recurring || !!data.recurrence_pattern,
    { message: "Select a recurrence pattern", path: ["recurrence_pattern"] }
  )

type TaskFormValues = z.infer<typeof taskSchema>

interface TaskFormProps {
  assigneeId: string
  task?: Task
  onSuccess?: () => void
  className?: string
}

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

export function TaskForm({ assigneeId, task, onSuccess, className }: TaskFormProps) {
  const { profile } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const isEditing = !!task
  const isOccurrence = !!task?.parent_task_id

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      deadline: task?.deadline ? toDatetimeLocal(task.deadline) : "",
      difficulty_level: (task?.difficulty_level as DifficultyLevel) ?? "medium",
      is_recurring: isOccurrence ? false : (task?.is_recurring ?? false),
      recurrence_pattern: isOccurrence
        ? null
        : ((task?.recurrence_pattern as RecurrencePattern) ?? null),
    },
  })

  const isRecurring = watch("is_recurring")

  async function onSubmit(values: TaskFormValues) {
    if (!profile) {
      toast.error("You must be logged in")
      return
    }

    setSubmitting(true)
    const supabase = createClient()

    try {
      if (isEditing && task) {
        const { error } = await supabase
          .from("tasks")
          .update(
            isOccurrence
              ? {
                  title: values.title,
                  description: values.description || null,
                  deadline: new Date(values.deadline).toISOString(),
                  difficulty_level: values.difficulty_level,
                  updated_at: new Date().toISOString(),
                }
              : {
                  title: values.title,
                  description: values.description || null,
                  deadline: new Date(values.deadline).toISOString(),
                  difficulty_level: values.difficulty_level,
                  is_recurring: values.is_recurring,
                  recurrence_pattern: values.is_recurring
                    ? values.recurrence_pattern
                    : null,
                  updated_at: new Date().toISOString(),
                }
          )
          .eq("id", task.id)

        if (error) throw error

        if (!isOccurrence && values.is_recurring) {
          await supabase.rpc("ensure_recurring_task_occurrences", {
            look_ahead_days: 7,
          })
        }

        toast.success("Task updated")
        void import("@/lib/push-client").then(({ notifyPush }) =>
          notifyPush({
            title: "Task updated",
            body: values.title,
            url: `/dashboard/task/${task.id}`,
            target: "slave",
          })
        )
      } else {
        const { error } = await supabase.from("tasks").insert({
          title: values.title,
          description: values.description || null,
          assigned_by: profile.id,
          assigned_to: assigneeId,
          deadline: new Date(values.deadline).toISOString(),
          difficulty_level: values.difficulty_level,
          is_recurring: values.is_recurring,
          recurrence_pattern: values.is_recurring
            ? values.recurrence_pattern
            : null,
          status: "pending",
          updated_at: new Date().toISOString(),
          parent_task_id: null,
          occurrence_key: null,
        })

        if (error) throw error

        if (values.is_recurring) {
          await supabase.rpc("ensure_recurring_task_occurrences", {
            look_ahead_days: 7,
          })
        }

        toast.success(
          values.is_recurring
            ? "Recurring series created — dated duties generated"
            : "Task assigned"
        )
        void import("@/lib/push-client").then(({ notifyPush }) =>
          notifyPush({
            title: "New task",
            body: values.title,
            url: "/dashboard/tasks",
            target: "slave",
          })
        )
      }

      onSuccess?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save task"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn(
        "space-y-6 rounded-xl border border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--charcoal,#1a1a1a)] p-6",
        className
      )}
    >
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          {...register("title")}
          placeholder="Task title"
          className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]"
          aria-invalid={!!errors.title}
        />
        {errors.title && (
          <p className="text-xs text-red-400">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          {...register("description")}
          placeholder="Detailed instructions..."
          rows={4}
          className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="deadline">
          {isRecurring && !isOccurrence
            ? "Due time (repeats each period)"
            : "Deadline"}
        </Label>
        <Input
          id="deadline"
          type="datetime-local"
          {...register("deadline")}
          className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]"
          aria-invalid={!!errors.deadline}
        />
        {isRecurring && !isOccurrence ? (
          <p className="text-xs text-muted-foreground">
            Daily tasks appear every day at this time. Weekly on this weekday.
            Monthly on this day of the month.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Change this to extend or shorten how long D has to complete it.
          </p>
        )}
        {errors.deadline && (
          <p className="text-xs text-red-400">{errors.deadline.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Difficulty</Label>
        <Select
          value={watch("difficulty_level")}
          onValueChange={(v) =>
            setValue("difficulty_level", v as DifficultyLevel)
          }
        >
          <SelectTrigger className="w-full border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isOccurrence && (
        <>
          <div className="flex items-center gap-3">
            <Checkbox
              id="is_recurring"
              checked={isRecurring}
              onCheckedChange={(checked) =>
                setValue("is_recurring", checked === true)
              }
            />
            <Label htmlFor="is_recurring" className="cursor-pointer">
              Recurring task
            </Label>
          </div>

          {isRecurring && (
            <div className="space-y-1.5">
              <Label>Recurrence Pattern</Label>
              <Select
                value={watch("recurrence_pattern") ?? ""}
                onValueChange={(v) =>
                  setValue("recurrence_pattern", v as RecurrencePattern)
                }
              >
                <SelectTrigger className="w-full border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]">
                  <SelectValue placeholder="Select pattern" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              {errors.recurrence_pattern && (
                <p className="text-xs text-red-400">
                  {errors.recurrence_pattern.message}
                </p>
              )}
            </div>
          )}
        </>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-[color:var(--gold,#d4af37)] text-[color:var(--black,#0a0a0a)] hover:bg-[color:var(--gold,#d4af37)]/90"
      >
        {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
        {isEditing ? "Save changes" : "Assign Task"}
      </Button>
    </form>
  )
}
