"use client";

import { useEffect, useState } from "react";
import { signObjectUrl } from "@/lib/storage/client";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { TeaseViewCapture } from "@/lib/types";

type Props = {
  capture: TeaseViewCapture;
  className?: string;
};

export function TeaseViewCapturePlayer({ capture, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void signObjectUrl({
      bucket: "tease_reactions",
      path: capture.video_path,
      expiresIn: 3600,
    }).then((signed) => {
      if (!cancelled) setUrl(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [capture.video_path]);

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-gold/20 bg-void/50 p-3",
        className
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-gold/90">
        D’s reaction view · {formatRelative(capture.created_at)}
      </p>
      {url ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={url}
          controls
          playsInline
          className="max-h-48 w-full rounded-md bg-black object-contain"
        />
      ) : (
        <div className="flex h-32 items-center justify-center rounded-md bg-void text-xs text-muted-foreground">
          Loading reaction…
        </div>
      )}
    </div>
  );
}
