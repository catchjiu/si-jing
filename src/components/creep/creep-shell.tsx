"use client";

import { CREEP_QUOTE } from "@/lib/creep";
import { RoleSpeech } from "@/components/ui/role-speech";

export function CreepShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <p className="font-heading text-base italic leading-snug text-gold/85 sm:text-lg">
        <RoleSpeech text={CREEP_QUOTE} role="slave" />
      </p>
      {children}
    </div>
  );
}
