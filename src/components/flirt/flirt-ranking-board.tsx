"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Crown, Trophy, User } from "lucide-react";
import { signObjectUrl } from "@/lib/storage/client";
import type { FlirtGuy, FlirtGuyWithSignedUrl } from "@/lib/types";
import { rankFlirtGuys } from "@/lib/flirt-score";
import { cn } from "@/lib/utils";

async function withSignedUrls(
  guys: FlirtGuy[]
): Promise<FlirtGuyWithSignedUrl[]> {
  return Promise.all(
    guys.map(async (g) => {
      if (!g.photo_path) return g;
      const signedUrl =
        (await signObjectUrl({
          bucket: "flirt",
          path: g.photo_path,
        })) ?? undefined;
      return { ...g, signedUrl };
    })
  );
}

export function FlirtRankingBoard({ guys }: { guys: FlirtGuy[] }) {
  const [rows, setRows] = useState<FlirtGuyWithSignedUrl[]>([]);

  useEffect(() => {
    let cancelled = false;
    void withSignedUrls(guys).then((signed) => {
      if (!cancelled) setRows(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [guys]);

  const ranked = useMemo(() => rankFlirtGuys(rows), [rows]);

  if (ranked.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-gold/20 bg-charcoal/80 p-4 sm:p-5">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Leaderboard
        </p>
        <h2 className="font-heading flex items-center gap-2 text-xl text-gold">
          <Trophy className="h-5 w-5" />
          Ranking
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Overall score = average of interest, hotness, face, body, and dick
          size
        </p>
      </div>

      <ol className="space-y-2">
        {ranked.map(({ guy, score, rank }) => (
          <li key={guy.id}>
            <Link
              href={`/dashboard/flirt/${guy.id}`}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                rank === 1
                  ? "border-gold/45 bg-gold/10"
                  : "border-gold/15 bg-void/40 hover:border-gold/30"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-heading text-sm",
                  rank === 1
                    ? "bg-gold text-void"
                    : "bg-void/80 text-gold ring-1 ring-gold/30"
                )}
              >
                {rank === 1 ? <Crown className="h-4 w-4" /> : `#${rank}`}
              </span>

              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-gold/25 bg-void/50">
                {guy.signedUrl ? (
                  <Image
                    src={guy.signedUrl}
                    alt={guy.name}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gold/70">
                    {guy.name.trim().charAt(0).toUpperCase() || (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-heading text-sm text-ivory">
                  {guy.name}
                  {guy.is_slave ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-gold/80">
                      Slave
                    </span>
                  ) : null}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Body {guy.body_score ?? 50}
                  {guy.is_slave ? " · from progress pic" : ""} · Dick{" "}
                  {guy.dick_size_cm ?? 19}cm
                </p>
              </div>

              <div className="text-right">
                <p className="font-heading text-lg text-gold">{score}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Overall
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
