"use client";

import { InboxList } from "@/components/inbox/inbox-list";

export default function InboxPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl text-ivory sm:text-3xl">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One Queen Sisi thread for messages, comments, and important posts —
          tap a preview to jump straight there
        </p>
      </div>
      <InboxList />
    </div>
  );
}
