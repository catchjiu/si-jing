"use client";

import type { UserRole } from "@/lib/types";
import type { RoleDisplayTitle } from "@/lib/role-display";
import { formatRoleSpeech } from "@/lib/role-speech";

/** Renders free text with role speech casing for the author. */
export function RoleSpeech({
  text,
  role,
  dominantTitle = "Queen",
  className,
}: {
  text: string | null | undefined;
  role: UserRole | null | undefined;
  dominantTitle?: RoleDisplayTitle;
  className?: string;
}) {
  if (!text) return null;
  return (
    <span className={className}>
      {formatRoleSpeech(text, role, dominantTitle)}
    </span>
  );
}
