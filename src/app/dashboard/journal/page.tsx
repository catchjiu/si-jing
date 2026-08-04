"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { JournalEntryWithSignedUrl } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { signObjectUrl } from "@/lib/storage/client";
import { JournalEntryForm } from "@/components/journal/journal-entry-form";
import { JournalCommentThread } from "@/components/journal/journal-comment-thread";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { GeoMapLinks } from "@/components/location/geo-map-links";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { RoleSpeech } from "@/components/ui/role-speech";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function JournalPage() {
  const { isQueen, isSlave, profile, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<JournalEntryWithSignedUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEntryId, setNewEntryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("journal_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (isSlave) {
      query = query.eq("author_id", profile.id);
    }

    const { data } = await query;
    const rows = (data as JournalEntryWithSignedUrl[]) ?? [];
    const withUrls = await Promise.all(
      rows.map(async (entry) => {
        if (!entry.image_path) return entry;
        const signedUrl =
          (await signObjectUrl({
            bucket: "journal",
            path: entry.image_path,
          })) ?? undefined;
        return { ...entry, signedUrl };
      })
    );
    setEntries(withUrls);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-2xl text-ivory sm:text-3xl">
          <BookOpen className="h-7 w-7 text-gold" />
          Journal
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "D's reflections — shared entries and your comments"
            : "Daily reflections — private or shared with Queen"}
        </p>
      </div>

      {isSlave && (
        <JournalEntryForm
          onSuccess={(id) => {
            setNewEntryId(id ?? null);
            void load();
          }}
        />
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Entries</h2>
        {entries.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
            {isQueen ? "No shared journal entries yet." : "No entries yet."}
          </div>
        ) : (
          <ul className="space-y-4">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "rounded-xl border bg-charcoal/80 p-4 sm:p-5",
                  entry.id === newEntryId
                    ? "border-gold/40"
                    : "border-gold/15"
                )}
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-wider"
                  >
                    {entry.entry_date}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] uppercase tracking-wider",
                      entry.visibility === "private"
                        ? "border-muted text-muted-foreground"
                        : "border-gold/40 text-gold"
                    )}
                  >
                    {entry.visibility}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(entry.created_at)}
                  </span>
                </div>
                {entry.body.trim() && (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ivory/90">
                    <RoleSpeech text={entry.body} role="slave" />
                  </p>
                )}
                {entry.signedUrl && (
                  <WatermarkedFrame
                    className={cn(
                      "rounded-lg border border-gold/15",
                      entry.body.trim() ? "mt-3" : ""
                    )}
                    mediaPath={entry.image_path}
                  >
                    <a
                      href={entry.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Image
                        src={entry.signedUrl}
                        alt="Journal photo"
                        width={960}
                        height={640}
                        className="h-auto max-h-96 w-full bg-void object-contain"
                        unoptimized
                      />
                    </a>
                  </WatermarkedFrame>
                )}
                {entry.latitude != null && entry.longitude != null && (
                  <GeoMapLinks
                    latitude={entry.latitude}
                    longitude={entry.longitude}
                    accuracy_m={entry.accuracy_m}
                    location_source={entry.location_source}
                    className="mt-2"
                  />
                )}

                <JournalCommentThread
                  entryId={entry.id}
                  visibility={entry.visibility as "private" | "shared"}
                />

                {(entry.visibility === "shared" || isSlave) && (
                  <div className="mt-4 border-t border-gold/10 pt-4">
                    <VoiceNotes
                      entityType="journal"
                      entityId={entry.id}
                      compact
                      title="Voice note"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
