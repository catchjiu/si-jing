"use client";

import { useEffect, useState } from "react";
import { AvatarImage } from "@/components/ui/avatar";
import { isR2Path } from "@/lib/storage/paths";
import { signObjectUrl } from "@/lib/storage/client";

/** Resolves R2 avatar paths to signed URLs; passes through https URLs. */
export function SignedAvatarImage({
  avatarUrl,
  alt,
}: {
  avatarUrl: string | null | undefined;
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(
    avatarUrl && !isR2Path(avatarUrl) ? avatarUrl : null
  );

  useEffect(() => {
    let cancelled = false;
    if (!avatarUrl) {
      setSrc(null);
      return;
    }
    if (!isR2Path(avatarUrl)) {
      setSrc(avatarUrl);
      return;
    }
    void signObjectUrl({
      bucket: "submissions",
      path: avatarUrl,
      expiresIn: 60 * 60 * 24,
    }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  if (!src) return null;
  return <AvatarImage src={src} alt={alt} />;
}
