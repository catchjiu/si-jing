"use client";

import { InboxList } from "@/components/inbox/inbox-list";

export default function InboxPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl text-ivory sm:text-3xl">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Direct chat on top, then topic threads for teases, duties, dates, and
          more
        </p>
      </div>
      <InboxList />
    </div>
  );
}
