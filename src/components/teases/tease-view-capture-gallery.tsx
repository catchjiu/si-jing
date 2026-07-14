"use client";

import { useEffect, useState } from "react";
import { signObjectUrl } from "@/lib/storage/client";
import { formatRelative } from "@/lib/format";
import { formatTeaseViewCount } from "@/lib/tease-views";
import { cn } from "@/lib/utils";
import type { TeaseMediaKind, TeaseViewCapture } from "@/lib/types";

type Props = {
  captures: TeaseViewCapture[];
  mediaKind?: TeaseMediaKind;
  className?: string;
};

function CaptureVideo({
  capture,
  index,
  total,
  mediaKind,
}: {
  capture: TeaseViewCapture;
  index: number;
  total: number;
  mediaKind: TeaseMediaKind;
}) {
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

  const metric =
    capture.watch_metric != null
      ? mediaKind === "video"
        ? "1 view"
        : capture.watch_metric < 60
          ? `${capture.watch_metric}s`
          : formatTeaseViewCount(capture.watch_metric, "image")
      : null;

  return (
    <div className="space-y-2 rounded-lg border border-gold/20 bg-void/50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gold/90">
        Reaction #{total - index}
        {metric ? ` · ${metric}` : ""}
        {" · "}
        {formatRelative(capture.created_at)}
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

export function TeaseViewCaptureGallery({
  captures,
  mediaKind = "image",
  className,
}: Props) {
  if (!captures.length) return null;

  const sorted = [...captures].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {sorted.length} reaction video{sorted.length === 1 ? "" : "s"}
      </p>
      {sorted.map((capture, index) => (
        <CaptureVideo
          key={capture.id}
          capture={capture}
          index={index}
          total={sorted.length}
          mediaKind={mediaKind}
        />
      ))}
    </div>
  );
}
