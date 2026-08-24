"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function FartTrackerRedirectPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <FartTrackerRedirectInner />
    </Suspense>
  );
}

function FartTrackerRedirectInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const qs = params.toString();
    router.replace(`/dashboard/creep/fart${qs ? `?${qs}` : ""}`);
  }, [params, router]);

  return <p className="text-sm text-muted-foreground">Opening Creep…</p>;
}
