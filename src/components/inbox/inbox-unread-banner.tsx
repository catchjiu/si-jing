"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, X } from "lucide-react";
import { useInboxUnread } from "@/components/inbox/use-inbox-unread";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_PREFIX = "queen-sisi:unread-banner:";

/** Persistent banner on dashboard when Inbox has unread. */
export function InboxUnreadBanner({ className }: { className?: string }) {
  const { total, summaryParts } = useInboxUnread();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const fingerprint = summaryParts.join("|");
  const dismissKey = fingerprint
    ? `${DISMISS_PREFIX}${fingerprint}`
    : null;

  useEffect(() => {
    if (!dismissKey) {
      setDismissedKey(null);
      return;
    }
    setDismissedKey(
      localStorage.getItem(dismissKey) === "1" ? dismissKey : null
    );
  }, [dismissKey]);

  if (total <= 0 || !dismissKey || dismissedKey === dismissKey) return null;

  return (
    <div
      className={cn(
        "relative flex flex-wrap items-center gap-3 rounded-xl border border-gold/30 bg-gradient-to-r from-gold/10 to-charcoal/80 px-4 py-3",
        className
      )}
    >
      <Inbox className="h-4 w-4 shrink-0 text-gold" />
      <p className="min-w-0 flex-1 text-sm text-ivory">
        <span className="font-medium text-gold">You have updates — </span>
        {summaryParts.join(" · ")}
      </p>
      <Button
        asChild
        size="sm"
        className="bg-gold text-void hover:bg-gold-muted"
      >
        <Link href="/dashboard/inbox">Open Inbox</Link>
      </Button>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(dismissKey, "1");
          setDismissedKey(dismissKey);
        }}
        className="rounded-md p-1 text-muted-foreground hover:text-ivory"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
