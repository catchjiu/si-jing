"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, MessageSquare, Pencil, Reply, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/auth-context"
import type { CommentWithAuthor } from "@/lib/types"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SignedAvatarImage } from "@/components/ui/signed-avatar-image"

interface CommentThreadProps {
  submissionId: string
  className?: string
}

interface CommentNode extends CommentWithAuthor {
  replies: CommentNode[]
}

function buildCommentTree(comments: CommentWithAuthor[]): CommentNode[] {
  const map = new Map<string, CommentNode>()
  const roots: CommentNode[] = []

  for (const comment of comments) {
    map.set(comment.id, { ...comment, replies: [] })
  }

  for (const comment of comments) {
    const node = map.get(comment.id)!
    if (comment.parent_id && map.has(comment.parent_id)) {
      map.get(comment.parent_id)!.replies.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

export function CommentThread({ submissionId, className }: CommentThreadProps) {
  const { profile } = useAuth()
  const [comments, setComments] = useState<CommentWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState("")
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase
      .from("comments")
      .select("*, author:users!commented_by(id, username, avatar_url, role)")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true })

    if (error) {
      toast.error("Failed to load comments")
      return
    }

    setComments((data as CommentWithAuthor[]) ?? [])
    setLoading(false)
  }, [submissionId, supabase])

  useEffect(() => {
    fetchComments()

    const channel = supabase
      .channel(`comments:${submissionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `submission_id=eq.${submissionId}`,
        },
        () => {
          fetchComments()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [submissionId, fetchComments, supabase])

  const tree = useMemo(() => buildCommentTree(comments), [comments])

  async function handleAddComment(parentId: string | null = null) {
    const content = parentId ? editContent : newComment
    if (!content.trim() || !profile) return

    setSubmitting(true)
    try {
      const { error } = await supabase.from("comments").insert({
        submission_id: submissionId,
        commented_by: profile.id,
        content: content.trim(),
        parent_id: parentId,
      })

      if (error) throw error

      if (parentId) {
        setReplyTo(null)
        setEditContent("")
      } else {
        setNewComment("")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to post comment"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdateComment(commentId: string) {
    if (!editContent.trim()) return

    setSubmitting(true)
    try {
      const { error } = await supabase
        .from("comments")
        .update({
          content: editContent.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", commentId)
        .eq("commented_by", profile?.id ?? "")

      if (error) throw error

      setEditingId(null)
      setEditContent("")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update comment"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("commented_by", profile?.id ?? "")

      if (error) throw error
      toast.success("Comment deleted")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete comment"
      toast.error(message)
    }
  }

  function renderComment(node: CommentNode, depth = 0) {
    const isOwn = profile?.id === node.commented_by
    const isEditing = editingId === node.id
    const isReplying = replyTo === node.id
    const initials = node.author?.username?.[0]?.toUpperCase() ?? "?"

    return (
      <div
        key={node.id}
        className={cn(depth > 0 && "ml-6 border-l border-[color:var(--gold,#d4af37)]/10 pl-4")}
      >
        <div className="flex gap-3 py-3">
          <Avatar size="sm">
            {node.author?.avatar_url && (
              <SignedAvatarImage
                avatarUrl={node.author.avatar_url}
                alt={node.author.username}
              />
            )}
            <AvatarFallback className="bg-[color:var(--purple,#2d1b69)] text-[color:var(--gold,#d4af37)]">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[color:var(--white,#f5f5f5)]">
                {node.author?.username ?? "Unknown"}
              </span>
              <span className="text-xs text-[color:var(--white,#f5f5f5)]/30">
                {formatRelative(node.created_at)}
              </span>
            </div>

            {isEditing ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={2}
                  className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleUpdateComment(node.id)}
                    disabled={submitting}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null)
                      setEditContent("")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-[color:var(--white,#f5f5f5)]/80">
                {node.content}
              </p>
            )}

            {!isEditing && (
              <div className="mt-2 flex gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-[color:var(--white,#f5f5f5)]/40"
                  onClick={() => {
                    setReplyTo(node.id)
                    setEditContent("")
                  }}
                >
                  <Reply className="mr-1 size-3" />
                  Reply
                </Button>
                {isOwn && (
                  <>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-[color:var(--white,#f5f5f5)]/40"
                      onClick={() => {
                        setEditingId(node.id)
                        setEditContent(node.content)
                        setReplyTo(null)
                      }}
                    >
                      <Pencil className="mr-1 size-3" />
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-red-400/60 hover:text-red-400"
                      onClick={() => handleDeleteComment(node.id)}
                    >
                      <Trash2 className="mr-1 size-3" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            )}

            {isReplying && (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Write a reply..."
                  rows={2}
                  className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleAddComment(node.id)}
                    disabled={submitting || !editContent.trim()}
                  >
                    {submitting && <Loader2 className="mr-1 size-3 animate-spin" />}
                    Reply
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReplyTo(null)
                      setEditContent("")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {node.replies.map((reply) => renderComment(reply, depth + 1))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--charcoal,#1a1a1a)] p-6",
        className
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare className="size-5 text-[color:var(--gold,#d4af37)]" />
        <h3 className="font-heading text-lg text-[color:var(--white,#f5f5f5)]">
          Comments
        </h3>
        <span className="text-sm text-[color:var(--white,#f5f5f5)]/40">
          ({comments.length})
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-[color:var(--gold,#d4af37)]" />
        </div>
      ) : tree.length === 0 ? (
        <p className="py-4 text-center text-sm text-[color:var(--white,#f5f5f5)]/40">
          No comments yet. Start the conversation.
        </p>
      ) : (
        <div className="divide-y divide-[color:var(--gold,#d4af37)]/5">
          {tree.map((node) => renderComment(node))}
        </div>
      )}

      <div className="mt-6 space-y-3 border-t border-[color:var(--gold,#d4af37)]/10 pt-6">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
          className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]"
        />
        <Button
          onClick={() => handleAddComment(null)}
          disabled={submitting || !newComment.trim()}
          className="bg-[color:var(--gold,#d4af37)] text-[color:var(--black,#0a0a0a)] hover:bg-[color:var(--gold,#d4af37)]/90"
        >
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          Post Comment
        </Button>
      </div>
    </div>
  )
}
