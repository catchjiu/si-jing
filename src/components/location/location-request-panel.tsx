"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  MapPin,
  MapPinned,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { hasPunishmentEffect } from "@/lib/punishments";
import {
  appleMapsUrl,
  formatAccuracy,
  formatCoords,
  getCurrentPosition,
  googleMapsUrl,
} from "@/lib/location";
import { formatRelative } from "@/lib/format";
import type { LocationRequest, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type LocationRequestRow = LocationRequest & {
  requester?: Pick<Profile, "id" | "username" | "role"> | null;
  target?: Pick<Profile, "id" | "username" | "role"> | null;
};

function statusClass(status: LocationRequest["status"]) {
  if (status === "pending") return "border-gold/40 text-gold";
  if (status === "shared") return "border-emerald-500/40 text-emerald-300";
  if (status === "declined") return "border-red-500/40 text-red-300";
  return "border-muted text-muted-foreground";
}

export function LocationRequestPanel({ className }: { className?: string }) {
  const { profile, isQueen, isSlave } = useAuth();
  const [items, setItems] = useState<LocationRequestRow[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [contactBlocked, setContactBlocked] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("location_requests")
      .select(
        "*, requester:users!requested_by(id, username, role), target:users!requested_from(id, username, role)"
      )
      .or(`requested_by.eq.${profile.id},requested_from.eq.${profile.id}`)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setItems((data as LocationRequestRow[]) ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`location-requests:${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "location_requests" },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile, load]);

  useEffect(() => {
    if (!profile) return;
    const findOther = async () => {
      const supabase = createClient();
      const role = profile.role === "queen" ? "slave" : "queen";
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", role)
        .limit(1)
        .maybeSingle();
      setOther((data as Profile | null) ?? null);
    };
    void findOther();
  }, [profile]);

  useEffect(() => {
    if (!isSlave || !profile) {
      setContactBlocked(false);
      return;
    }
    void hasPunishmentEffect("contact", profile.id).then(setContactBlocked);
  }, [isSlave, profile]);

  const requestLocation = async () => {
    if (!profile || !other) return;
    if (contactBlocked) {
      toast.error("Contact is restricted — you cannot request location");
      return;
    }
    setBusy("request");
    const supabase = createClient();
    const { error } = await supabase.from("location_requests").insert({
      requested_by: profile.id,
      requested_from: other.id,
      message: message.trim() || null,
      status: "pending",
    });
    setBusy(null);
    if (error) {
      if (error.code === "23505") {
        toast.error("You already have a pending location request");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Location requested");
    setMessage("");
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Location requested",
        body: isQueen
          ? "Queen wants your location"
          : "D is asking for your location",
        url: "/dashboard/requests",
        target: isQueen ? "slave" : "queen",
      })
    );
    void load();
  };

  const cancel = async (id: string) => {
    setBusy(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("location_requests")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending");
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Request cancelled");
    void load();
  };

  const decline = async (id: string) => {
    setBusy(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("location_requests")
      .update({
        status: "declined",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending");
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Declined");
    const row = items.find((i) => i.id === id);
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Location declined",
        body: "Your location request was declined",
        url: "/dashboard/requests",
        target: row?.requester?.role === "queen" ? "queen" : "slave",
      })
    );
    void load();
  };

  const share = async (id: string) => {
    setBusy(id);
    try {
      const point = await getCurrentPosition();
      const supabase = createClient();
      const { error } = await supabase
        .from("location_requests")
        .update({
          status: "shared",
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy_m: point.accuracy_m,
          shared_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending");
      if (error) throw error;
      toast.success("Location shared");
      const row = items.find((i) => i.id === id);
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Location shared",
          body: formatCoords(point.latitude, point.longitude),
          url: "/dashboard/requests",
          target: row?.requester?.role === "queen" ? "queen" : "slave",
        })
      );
      void load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not share location"
      );
    } finally {
      setBusy(null);
    }
  };

  const pendingIncoming = items.filter(
    (i) => i.status === "pending" && i.requested_from === profile?.id
  );
  const pendingOutgoing = items.filter(
    (i) => i.status === "pending" && i.requested_by === profile?.id
  );
  const history = items.filter((i) => i.status !== "pending").slice(0, 8);

  return (
    <section
      className={cn(
        "space-y-4 rounded-xl border border-gold/20 bg-charcoal/70 p-4 sm:p-5",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-royal/30">
          <MapPinned className="h-5 w-5 text-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-xl text-ivory">Location</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Request or share a one-time pin. On iPhone, allow Location for this
            site when prompted.
          </p>
        </div>
      </div>

      {contactBlocked ? (
        <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-200">
          Contact restriction is active — you cannot request location.
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional note…"
            maxLength={160}
            className="border-gold/20 bg-void/60"
            disabled={!other}
          />
          <Button
            type="button"
            onClick={() => void requestLocation()}
            disabled={busy === "request" || !other}
            className="shrink-0 bg-gold text-void hover:bg-gold-muted"
          >
            {busy === "request" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="mr-2 h-4 w-4" />
            )}
            Request location
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {pendingIncoming.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-gold/25 bg-void/50 p-3 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("text-[10px] uppercase", statusClass("pending"))}
                >
                  Incoming
                </Badge>
                <p className="text-sm text-ivory">
                  {row.requester?.username ?? "Someone"} wants your location
                </p>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(row.created_at)}
                </span>
              </div>
              {row.message && (
                <p className="text-sm text-muted-foreground italic">
                  {row.message}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void share(row.id)}
                  disabled={busy === row.id}
                  className="bg-gold text-void hover:bg-gold-muted"
                >
                  {busy === row.id ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-3.5 w-3.5" />
                  )}
                  Share my location
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void decline(row.id)}
                  disabled={busy === row.id}
                  className="border-red-500/40 text-red-300"
                >
                  <X className="mr-2 h-3.5 w-3.5" />
                  Decline
                </Button>
              </div>
            </div>
          ))}

          {pendingOutgoing.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/15 bg-void/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-ivory">
                  Waiting on {row.target?.username ?? "them"}…
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRelative(row.created_at)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void cancel(row.id)}
                disabled={busy === row.id}
                className="border-muted"
              >
                Cancel
              </Button>
            </div>
          ))}

          {history.length > 0 && (
            <ul className="space-y-2">
              {history.map((row) => {
                const mine = row.requested_by === profile?.id;
                const hasPin =
                  row.status === "shared" &&
                  row.latitude != null &&
                  row.longitude != null;
                return (
                  <li
                    key={row.id}
                    className="rounded-lg border border-gold/10 bg-void/30 px-3 py-2 space-y-1"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] uppercase",
                          statusClass(row.status)
                        )}
                      >
                        {row.status}
                      </Badge>
                      <p className="text-sm text-ivory/90">
                        {mine
                          ? `You → ${row.target?.username ?? "them"}`
                          : `${row.requester?.username ?? "Someone"} → you`}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {formatRelative(row.shared_at ?? row.created_at)}
                      </span>
                    </div>
                    {hasPin && (
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-muted-foreground">
                          {formatCoords(row.latitude!, row.longitude!)}
                          {formatAccuracy(row.accuracy_m)
                            ? ` · ${formatAccuracy(row.accuracy_m)}`
                            : ""}
                        </span>
                        <a
                          href={appleMapsUrl(row.latitude!, row.longitude!)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gold hover:underline"
                        >
                          Apple Maps
                        </a>
                        <a
                          href={googleMapsUrl(row.latitude!, row.longitude!)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gold hover:underline"
                        >
                          Google Maps
                        </a>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!loading &&
            pendingIncoming.length === 0 &&
            pendingOutgoing.length === 0 &&
            history.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No location requests yet.
              </p>
            )}
        </div>
      )}
    </section>
  );
}
