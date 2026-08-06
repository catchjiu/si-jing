"use client";

import Link from "next/link";
import {
  Ban,
  BookOpen,
  CalendarHeart,
  Gift,
  Crown,
  HandHeart,
  Heart,
  HeartCrack,
  ListTodo,
  Lock,
  Sparkles,
  Sparkle,
} from "lucide-react";
import type { MessageAttachmentType } from "@/lib/inbox";
import { attachmentHref, attachmentLabel } from "@/lib/inbox";
import { cn } from "@/lib/utils";

interface MessageCardProps {
  type: MessageAttachmentType;
  id: string;
  anchor?: string | null;
  summary?: string | null;
  className?: string;
}

const ICONS: Record<
  MessageAttachmentType,
  React.ComponentType<{ className?: string }>
> = {
  tease: Sparkles,
  task: ListTodo,
  submission: ListTodo,
  punishment: Ban,
  reward: Gift,
  request: HandHeart,
  date: CalendarHeart,
  journal: BookOpen,
  wishlist: Heart,
  worship: Crown,
  worship_assignment: Sparkle,
  denial: Lock,
  jealousy_mission: HeartCrack,
};

export function MessageCard({
  type,
  id,
  anchor = null,
  summary,
  className,
}: MessageCardProps) {
  const Icon = ICONS[type] ?? ListTodo;
  return (
    <Link
      href={attachmentHref(type, id, anchor)}
      className={cn(
        "mt-2 flex items-start gap-3 rounded-lg border border-gold/30 bg-void/50 px-3 py-2.5 transition-colors hover:border-gold/50 hover:bg-gold/5",
        className
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-royal/40">
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-gold">
          {attachmentLabel(type)}
        </p>
        <p className="truncate text-sm text-ivory">
          {summary?.trim() || `Open ${attachmentLabel(type).toLowerCase()}`}
        </p>
      </div>
    </Link>
  );
}
