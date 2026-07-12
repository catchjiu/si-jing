"use client";

import type { UserRole } from "@/lib/types";
import { formatRoleSpeech } from "@/lib/role-speech";

/** Renders free text with role speech casing for the author. */
export function RoleSpeech({
  text,
  role,
  className,
}: {
  text: string | null | undefined;
  role: UserRole | null | undefined;
  className?: string;
}) {
  if (!text) return null;
  return <span className={className}>{formatRoleSpeech(text, role)}</span>;
}
