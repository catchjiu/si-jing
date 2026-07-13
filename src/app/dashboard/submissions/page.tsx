"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { SubmissionList } from "@/components/submissions/submission-list";
import type { SubmissionWithRelations } from "@/lib/types";

export default function SubmissionsPage() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("submissions")
      .select("*, task:tasks(*), media:submission_media(*), submitter:users!submitted_by(*)")
      .order("submitted_at", { ascending: false });

    if (isSlave) {
      query = query.eq("submitted_by", profile.id);
    }

    const { data } = await query;
    setSubmissions((data ?? []) as SubmissionWithRelations[]);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const pending = submissions.filter((s) => s.status === "pending");
  const reviewed = submissions.filter((s) => s.status !== "pending");

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-2xl text-ivory sm:text-3xl">
          <ClipboardList className="h-7 w-7 text-gold" />
          Submissions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Review proof from D and open any submission for approval"
            : "Your submitted proof and task completions"}
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">
          {isQueen ? "Awaiting review" : "Pending"}
          {pending.length > 0 ? ` (${pending.length})` : ""}
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
            {isQueen ? "Nothing to review right now." : "No pending submissions."}
          </div>
        ) : (
          <SubmissionList submissions={pending} canDelete={isSlave} />
        )}
      </section>

      {reviewed.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-heading text-xl text-gold">History</h2>
          <SubmissionList submissions={reviewed} canDelete={isSlave} />
        </section>
      )}
    </div>
  );
}
