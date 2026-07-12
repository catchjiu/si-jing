import { cn } from "@/lib/utils"
import { getStatusColor, getStatusLabel } from "@/lib/format"
import type { SubmissionStatus, TaskStatus } from "@/lib/types"
import { Badge } from "@/components/ui/badge"

interface StatusBadgeProps {
  status: TaskStatus | SubmissionStatus
  type?: "task" | "submission"
  className?: string
}

export function StatusBadge({
  status,
  type = "task",
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border text-[10px] uppercase tracking-wider",
        getStatusColor(status, type),
        className
      )}
    >
      {getStatusLabel(status, type)}
    </Badge>
  )
}
