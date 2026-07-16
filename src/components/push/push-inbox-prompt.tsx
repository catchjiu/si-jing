"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Loader2, X } from "lucide-react";
import {
  isStandaloneDisplay,
  urlBase64ToUint8Array,
} from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "queen-sisi:push-inbox-prompt-dismissed";

type Status = "loading" | "hide" | "off" | "needs_install";

/** Soft prompt on Inbox when push is available but not enabled. */
export function PushInboxPrompt({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY) === "1") {
      setStatus("hide");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("hide");
      return;
    }
    const isiOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isiOS && !isStandaloneDisplay()) {
      setStatus("needs_install");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "hide" : "off");
    } catch {
      setStatus("hide");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setStatus("hide");
  };

  const enable = async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      toast.error("Push is not configured on the server yet");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notification permission denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const serialized = JSON.parse(JSON.stringify(sub)) as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serialized),
      });
      if (!res.ok) throw new Error("Could not save subscription");
      toast.success("Push notifications enabled");
      setStatus("hide");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not enable push");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading" || status === "hide") return null;

  return (
    <div
      className={cn(
        "relative rounded-xl border border-gold/25 bg-charcoal/80 px-4 py-3",
        className
      )}
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:text-ivory"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex flex-wrap items-center gap-3 pr-6">
        <BellRing className="h-4 w-4 shrink-0 text-gold" />
        <p className="min-w-0 flex-1 text-sm text-ivory/90">
          {status === "needs_install"
            ? "Install Queen Sisi to Home Screen to get live alerts on iPhone."
            : "Turn on alerts so you don’t miss teases, worship, or tasks."}
        </p>
        {status === "off" && (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void enable()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Enable
          </Button>
        )}
      </div>
    </div>
  );
}
