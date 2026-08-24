"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ghost, Wind } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { creepFartHref, creepGalleryHref, creepHubHref } from "@/lib/creep";
import { useCreepGalleries } from "@/components/creep/use-creep-galleries";
import { RoleSpeech } from "@/components/ui/role-speech";

export function CreepShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isQueen, isSlave } = useAuth();
  const { galleries } = useCreepGalleries();

  const tabs = [
    { href: creepHubHref(), label: "Overview", exact: true },
    { href: creepFartHref(), label: "Fart Tracker", exact: false },
    ...galleries.map((g) => ({
      href: creepGalleryHref(g.id),
      label: g.title,
      exact: false,
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-2xl text-ivory sm:text-3xl">
          <Ghost className="h-7 w-7 text-gold" />
          Creep
        </h1>
        <p className="mt-2 font-heading text-base italic leading-snug text-gold/85 sm:text-lg">
          <RoleSpeech
            text="slave loving things about his Queen, she doesn't love about Herself."
            role="slave"
          />
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isQueen
            ? "Fart Tracker plus D’s galleries — Stretch Marks, Panties, and anything else he adds."
            : isSlave
              ? "Upload photos and videos to Stretch Marks, Panties, or a gallery you add. Queen logs farts here too."
              : "Private Creep chamber."}
        </p>
      </div>

      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const isFart = tab.href.startsWith("/dashboard/creep/fart");
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors",
                isActive
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-gold/20 text-muted-foreground hover:border-gold/40 hover:text-ivory"
              )}
            >
              {isFart ? (
                <Wind className="h-3 w-3" />
              ) : tab.exact ? (
                <Ghost className="h-3 w-3" />
              ) : null}
              {tab.exact || isFart ? (
                tab.label
              ) : (
                <RoleSpeech text={tab.label} role="slave" />
              )}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
