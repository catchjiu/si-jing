"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Loader2, Smartphone } from "lucide-react";
import {
  isStandaloneDisplay,
  notifyPush,
  urlBase64ToUint8Array,
} from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "loading" | "unsupported" | "needs_install" | "off" | "on";

export function PushEnableCard({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState(false);

  const refresh = useCallback(async () => {
    setStandalone(isStandaloneDisplay());
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    // iOS only allows push for Home Screen apps
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
      setStatus(sub ? "on" : "off");
    } catch {
      setStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        setBusy(false);
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

      setStatus("on");
      toast.success("Push notifications enabled");
      void notifyPush({
        title: "Queen Sisi",
        body: "Push is working — you are connected",
        url: "/dashboard",
        target: "both",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not enable push");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
      toast.success("Push notifications off");
    } catch {
      toast.error("Could not disable push");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-gold/20 bg-charcoal/80 p-5",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-royal/30">
          <BellRing className="h-5 w-5 text-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-lg text-ivory">App notifications</h3>
          <p className="text-sm text-muted-foreground">
            {status === "needs_install"
              ? "On iPhone: Safari → Share → Add to Home Screen, open the app icon, then enable here."
              : standalone
                ? "Running as Home Screen app — enable alerts for tasks, requests, and teases."
                : "Enable browser / Home Screen push for live alerts."}
          </p>
        </div>
      </div>

      {status === "loading" && (
        <p className="text-sm text-muted-foreground">Checking…</p>
      )}
      {status === "unsupported" && (
        <p className="text-sm text-muted-foreground">
          Push is not supported in this browser.
        </p>
      )}
      {status === "needs_install" && (
        <div className="flex items-center gap-2 rounded-lg border border-gold/15 bg-void/40 px-3 py-2 text-sm text-ivory/80">
          <Smartphone className="size-4 shrink-0 text-gold" />
          Install to Home Screen first (iOS 16.4+)
        </div>
      )}
      {status === "off" && (
        <Button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="bg-gold text-void hover:bg-gold-muted"
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <BellRing className="mr-2 h-4 w-4" />
          )}
          Enable notifications
        </Button>
      )}
      {status === "on" && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void disable()}
            className="border-muted"
          >
            Turn off
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void notifyPush({
                title: "Queen Sisi",
                body: "Test notification",
                url: "/dashboard",
                target: "both",
              })
            }
            className="border-gold/30 text-gold"
          >
            Send test
          </Button>
        </div>
      )}
    </div>
  );
}

/** Registers the service worker early when supported. */
export function PushServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  }, []);
  return null;
}
