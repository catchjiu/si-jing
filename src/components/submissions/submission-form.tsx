"use client"

import { useCallback, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { CheckCircle2, ImagePlus, Loader2, Upload, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import { getYouTubeEmbedUrl, isValidYouTubeUrl } from "@/lib/youtube"
import { downsizeImageIfNeeded } from "@/lib/image-compress"
import { resolveImageLocation } from "@/lib/location"
import { presignAndUpload } from "@/lib/storage/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

const submissionSchema = z.object({
  submission_text: z.string().max(2000).optional(),
  youtube_url: z
    .string()
    .optional()
    .refine((val) => !val || isValidYouTubeUrl(val), {
      message: "Enter a valid YouTube URL",
    }),
})

type SubmissionFormValues = z.infer<typeof submissionSchema>

interface SubmissionFormProps {
  taskId: string
  onSuccess?: () => void
  className?: string
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_FILE_SIZE = 10 * 1024 * 1024

export function SubmissionForm({ taskId, onSuccess, className }: SubmissionFormProps) {
  const { profile } = useAuth()
  const [files, setFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [submitting, setSubmitting] = useState<"proof" | "complete" | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    watch,
    formState: { errors },
  } = useForm<SubmissionFormValues>({
    resolver: zodResolver(submissionSchema),
    defaultValues: { submission_text: "", youtube_url: "" },
  })

  const youtubeUrl = watch("youtube_url")
  const embedUrl = youtubeUrl && isValidYouTubeUrl(youtubeUrl)
    ? getYouTubeEmbedUrl(youtubeUrl)
    : null

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const valid = Array.from(incoming).filter((file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: unsupported file type`)
        return false
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: file too large (max 10MB)`)
        return false
      }
      return true
    })
    setFiles((prev) => [...prev, ...valid])
  }, [])

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  async function createSubmission(options: {
    mode: "proof" | "complete"
    submissionText: string | null
    youtubeUrl?: string | null
    withMedia: boolean
  }) {
    if (!profile) {
      toast.error("You must be logged in")
      return
    }

    setSubmitting(options.mode)
    const supabase = createClient()

    try {
      const { data: submission, error: submissionError } = await supabase
        .from("submissions")
        .insert({
          task_id: taskId,
          submitted_by: profile.id,
          submission_text: options.submissionText,
          status: "pending",
        })
        .select("id")
        .single()

      if (submissionError || !submission) throw submissionError

      const submissionId = submission.id

      if (options.withMedia) {
        for (const file of files) {
          const geo = await resolveImageLocation(file)
          const uploadFile = await downsizeImageIfNeeded(file)
          if (uploadFile.size < file.size) {
            toast.message(
              `${file.name}: compressed to ${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`
            )
          }
          const ext = uploadFile.name.split(".").pop() || "jpg"
          const filePath = await presignAndUpload({
            bucket: "submissions",
            file: uploadFile,
            contentType: uploadFile.type || "image/jpeg",
            ext,
            relativePath: `${profile.id}/${submissionId}/${Date.now()}.${ext}`,
          })

          const { error: mediaError } = await supabase
            .from("submission_media")
            .insert({
              submission_id: submissionId,
              media_type: "image",
              file_path: filePath,
              youtube_url: null,
              latitude: geo?.latitude ?? null,
              longitude: geo?.longitude ?? null,
              accuracy_m: geo?.accuracy_m ?? null,
              location_source: geo?.source ?? null,
            })

          if (mediaError) throw mediaError
        }

        if (options.youtubeUrl?.trim()) {
          const { error: videoError } = await supabase
            .from("submission_media")
            .insert({
              submission_id: submissionId,
              media_type: "video",
              file_path: null,
              youtube_url: options.youtubeUrl.trim(),
            })

          if (videoError) throw videoError
        }
      }

      const { error: taskError } = await supabase
        .from("tasks")
        .update({ status: "submitted", updated_at: new Date().toISOString() })
        .eq("id", taskId)

      if (taskError) throw taskError

      toast.success(
        options.mode === "complete"
          ? "Marked complete — awaiting Queen's review"
          : "Submission sent for review"
      )
      setFiles([])
      onSuccess?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed"
      toast.error(message)
    } finally {
      setSubmitting(null)
    }
  }

  async function onSubmit(values: SubmissionFormValues) {
    if (files.length === 0 && !values.youtube_url?.trim()) {
      toast.error("Add at least one image or a YouTube URL")
      return
    }

    await createSubmission({
      mode: "proof",
      submissionText: values.submission_text?.trim() || null,
      youtubeUrl: values.youtube_url,
      withMedia: true,
    })
  }

  async function onMarkComplete() {
    const values = getValues()
    if (values.youtube_url?.trim() && !isValidYouTubeUrl(values.youtube_url)) {
      toast.error("Enter a valid YouTube URL, or clear it")
      return
    }

    await createSubmission({
      mode: "complete",
      submissionText:
        values.submission_text?.trim() || "Completed without evidence",
      youtubeUrl: null,
      withMedia: false,
    })
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn(
        "space-y-6 rounded-xl border border-[color:var(--purple,#2d1b69)]/30 bg-[color:var(--charcoal,#1a1a1a)] p-6",
        className
      )}
    >
      <div className="space-y-1.5">
        <Label htmlFor="submission_text">Caption / Notes</Label>
        <Textarea
          id="submission_text"
          {...register("submission_text")}
          placeholder="Describe your submission..."
          rows={3}
          className="border-[color:var(--purple,#2d1b69)]/30 bg-[color:var(--black,#0a0a0a)]"
        />
      </div>

      {/* Image upload */}
      <div className="space-y-2">
        <Label>Images</Label>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            "relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors",
            dragActive
              ? "border-[color:var(--gold,#d4af37)] bg-[color:var(--gold,#d4af37)]/5"
              : "border-[color:var(--purple,#2d1b69)]/40 hover:border-[color:var(--gold,#d4af37)]/40"
          )}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <Upload className="mb-2 size-8 text-[color:var(--gold,#d4af37)]/50" />
          <p className="text-sm text-[color:var(--white,#f5f5f5)]/60">
            Drag & drop images here, or click to browse
          </p>
          <p className="mt-1 text-xs text-[color:var(--white,#f5f5f5)]/30">
            JPEG, PNG, WebP, GIF — max 10MB each
          </p>
          <input
            id="file-input"
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-lg border border-[color:var(--purple,#2d1b69)]/30 bg-[color:var(--black,#0a0a0a)] px-3 py-2"
              >
                <ImagePlus className="size-4 shrink-0 text-[color:var(--gold,#d4af37)]" />
                <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="text-[color:var(--white,#f5f5f5)]/40 hover:text-red-400"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* YouTube URL */}
      <div className="space-y-1.5">
        <Label htmlFor="youtube_url">YouTube URL (optional)</Label>
        <Input
          id="youtube_url"
          {...register("youtube_url")}
          placeholder="https://youtube.com/watch?v=..."
          className="border-[color:var(--purple,#2d1b69)]/30 bg-[color:var(--black,#0a0a0a)]"
          aria-invalid={!!errors.youtube_url}
        />
        {errors.youtube_url && (
          <p className="text-xs text-red-400">{errors.youtube_url.message}</p>
        )}
      </div>

      {embedUrl && (
        <div className="overflow-hidden rounded-xl border border-[color:var(--gold,#d4af37)]/15">
          <div className="relative aspect-video w-full">
            <iframe
              src={embedUrl}
              title="YouTube preview"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 size-full"
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Button
          type="submit"
          disabled={submitting !== null}
          className="w-full bg-[color:var(--purple,#2d1b69)] text-[color:var(--white,#f5f5f5)] hover:bg-[color:var(--purple,#2d1b69)]/80"
        >
          {submitting === "proof" && (
            <Loader2 className="mr-2 size-4 animate-spin" />
          )}
          Submit Proof
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={submitting !== null}
          onClick={() => void onMarkComplete()}
          className="w-full border-gold/40 text-gold hover:bg-gold/10"
        >
          {submitting === "complete" ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 size-4" />
          )}
          Task Complete
        </Button>
        <p className="text-center text-xs text-[color:var(--white,#f5f5f5)]/40">
          Use Task Complete when no images or video are needed — still awaits
          Queen&apos;s review
        </p>
      </div>
    </form>
  )
}
