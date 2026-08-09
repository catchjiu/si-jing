"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, MessageSquare, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { DesireRequest } from "@/lib/types";
import { desireColor, desireLabel, REQUEST_TYPE_LABELS } from "@/lib/requests";
import { adjustPoints, fetchPointsBalance } from "@/lib/points";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { signObjectUrl } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { RequestThread } from "@/components/requests/request-thread";
import { RoleSpeech } from "@/components/ui/role-speech";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { ShareLinkButton } from "@/components/ui/share-link-button";
import { requestPageHref } from "@/lib/inbox-deep-links";

interface RequestCardProps {
  request: DesireRequest;
  isQueen?: boolean;
  onChanged?: () => void;
}

function statusClass(status: DesireRequest["status"]) {
  if (status === "pending") return "border-gold/40 text-gold";
  if (status === "approved") return "border-emerald-500/40 text-emerald-300";
  if (status === "denied") return "border-red-500/40 text-red-300";
  return "border-muted text-muted-foreground";
}

export function RequestCard({
  request,
  isQueen = false,
  onChanged,
}: RequestCardProps) {
  const { profile } = useAuth();
  const [response, setResponse] = useState("");
  const [pointCostInput, setPointCostInput] = useState("");
  const [busy, setBusy] = useState<
    "approve" | "deny" | "withdraw" | "respond" | "close" | "delete" | null
  >(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!request.image_path) {
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    void signObjectUrl({ bucket: "messages", path: request.image_path }).then(
      (url) => {
        if (!cancelled) setImageUrl(url);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [request.image_path]);

  const isDirective = (request.direction ?? "petition") === "directive";
  const canDelete =
    Boolean(profile) &&
    (request.requested_by === profile?.id || isQueen);

  const respond = async (decision: "approved" | "denied") => {
    const parsedCost = Number.parseInt(pointCostInput, 10);
    const charge =
      decision === "approved" && Number.isFinite(parsedCost) && parsedCost > 0
        ? parsedCost
        : null;

    if (charge != null && profile?.id) {
      const supabase = createClient();
      const balance = await fetchPointsBalance(supabase, request.requested_by);
      if (balance < charge) {
        toast.warning(`D only has ${balance} points`);
        if (
          !window.confirm(
            `D only has ${balance} points. Charge ${charge} anyway? Balance can go negative.`
          )
        ) {
          return;
        }
      }
    }

    setBusy(decision === "approved" ? "approve" : "deny");
    const supabase = createClient();
    const { error } = await supabase
      .from("requests")
      .update({
        status: decision,
        queen_response: response.trim()
          ? formatRoleSpeech(response.trim(), "queen")
          : null,
        responded_at: new Date().toISOString(),
        ...(decision === "approved" ? { point_cost: charge } : {}),
      })
      .eq("id", request.id);

    if (error) {
      setBusy(null);
      toast.error("Could not respond");
      return;
    }

    if (charge != null && profile?.id) {
      const pointsResult = await adjustPoints(supabase, {
        userId: request.requested_by,
        delta: -charge,
        reason: `Charged for: ${request.title}`,
        createdBy: profile.id,
        entityType: "request",
        entityId: request.id,
      });
      if (pointsResult.error) {
        toast.error(pointsResult.error);
      }
    }

    setBusy(null);
    toast.success(decision === "approved" ? "Request approved" : "Request denied");
    setResponse("");
    setPointCostInput("");
    const pushBody =
      decision === "approved" && charge != null
        ? `${request.title} — ${charge} points charged`
        : request.title;
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: decision === "approved" ? "Request granted" : "Request denied",
        body: pushBody,
        url: "/dashboard/requests",
        target: "slave",
      })
    );
    onChanged?.();
  };

  const withdraw = async () => {
    setBusy("withdraw");
    const supabase = createClient();
    const { error } = await supabase
      .from("requests")
      .update({ status: "withdrawn" })
      .eq("id", request.id);
    setBusy(null);
    if (error) {
      toast.error("Could not withdraw");
      return;
    }
    toast.success("Request withdrawn");
    onChanged?.();
  };

  const submitSlaveResponse = async () => {
    setBusy("respond");
    const supabase = createClient();
    const { error } = await supabase
      .from("requests")
      .update({
        slave_response: response.trim()
          ? formatRoleSpeech(response.trim(), "slave")
          : null,
        slave_responded_at: new Date().toISOString(),
        status: "approved",
      })
      .eq("id", request.id);
    setBusy(null);
    if (error) {
      toast.error("Could not submit response");
      return;
    }
    toast.success("Response submitted");
    setResponse("");
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Directive answered",
        body: request.title,
        url: "/dashboard/requests",
        target: "queen",
      })
    );
    onChanged?.();
  };

  const closeDirective = async () => {
    setBusy("close");
    const supabase = createClient();
    const { error } = await supabase
      .from("requests")
      .update({
        status: "approved",
        queen_response: response.trim()
          ? formatRoleSpeech(response.trim(), "queen")
          : request.queen_response,
        responded_at: new Date().toISOString(),
      })
      .eq("id", request.id);
    setBusy(null);
    if (error) {
      toast.error("Could not close directive");
      return;
    }
    toast.success("Directive closed");
    setResponse("");
    onChanged?.();
  };

  const remove = async () => {
    if (!canDelete) return;
    if (
      !window.confirm(
        "Delete this request and all of its messages? This cannot be undone."
      )
    ) {
      return;
    }
    setBusy("delete");
    const supabase = createClient();
    const { error } = await supabase
      .from("requests")
      .delete()
      .eq("id", request.id);
    setBusy(null);
    if (error) {
      toast.error(error.message || "Could not delete request");
      return;
    }
    toast.success("Request deleted");
    onChanged?.();
  };

  return (
    <article
      id={`request-${request.id}`}
      className={cn(
        "rounded-xl border bg-charcoal/80 p-4 sm:p-5",
        request.status === "pending" ? "border-gold/25" : "border-gold/10"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg text-ivory">
              <RoleSpeech
                text={request.title}
                role={isDirective ? "queen" : "slave"}
              />
            </h3>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] uppercase tracking-wider",
                statusClass(request.status)
              )}
            >
              {request.status}
            </Badge>
            {request.point_cost != null && request.point_cost > 0 && (
              <Badge
                variant="outline"
                className="border-gold/40 text-[10px] uppercase tracking-wider text-gold"
              >
                − {request.point_cost} pts
              </Badge>
            )}
            <Badge
              variant="outline"
              className="border-muted text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              {isDirective ? "From Queen" : REQUEST_TYPE_LABELS[request.request_type]}
            </Badge>
            {isDirective && (
              <Badge
                variant="outline"
                className="border-royal/50 text-[10px] uppercase tracking-wider text-ivory/80"
              >
                {REQUEST_TYPE_LABELS[request.request_type]}
              </Badge>
            )}
          </div>
          {request.message && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              <RoleSpeech
                text={request.message}
                role={isDirective ? "queen" : "slave"}
              />
            </p>
          )}
          {imageUrl && (
            <WatermarkedFrame
              className="mt-3 rounded-lg border border-gold/15"
              mediaPath={request.image_path}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Request attachment"
                className="max-h-72 w-full object-contain bg-void"
              />
            </WatermarkedFrame>
          )}
          <p className="text-xs text-muted-foreground">
            {formatRelative(request.created_at)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <ShareLinkButton
            path={requestPageHref(request.id)}
            successMessage="Request link copied"
          />
          {!isDirective && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Desire
              </p>
              <p
                className={cn(
                  "font-heading text-3xl tabular-nums",
                  desireColor(request.desire_level)
                )}
              >
                {request.desire_level}
              </p>
              <p className={cn("text-xs", desireColor(request.desire_level))}>
                {desireLabel(request.desire_level)}
              </p>
            </div>
          )}
        </div>
      </div>

      {!isDirective && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-void">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              request.desire_level >= 75
                ? "bg-red-500/80"
                : request.desire_level >= 45
                  ? "bg-gold"
                  : "bg-ivory/40"
            )}
            style={{ width: `${request.desire_level}%` }}
          />
        </div>
      )}

      {request.slave_response && (
        <div className="mt-4 rounded-lg border border-royal/30 bg-royal/15 p-3">
          <p className="text-[10px] uppercase tracking-wider text-ivory/70 mb-1">
            D&apos;s response
          </p>
          <p className="text-sm text-ivory/90 whitespace-pre-wrap">
            <RoleSpeech text={request.slave_response} role="slave" />
          </p>
        </div>
      )}

      {request.queen_response && (
        <div className="mt-4 rounded-lg border border-gold/20 bg-royal/20 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gold mb-1">
            Queen&apos;s reply
          </p>
          <p className="text-sm text-ivory/90 whitespace-pre-wrap">
            <RoleSpeech text={request.queen_response} role="queen" />
          </p>
        </div>
      )}

      {request.status !== "withdrawn" && (
        <div className="mt-4 border-t border-gold/10 pt-4">
          <RequestThread requestId={request.id} />
        </div>
      )}

      {isQueen && request.status === "pending" && isDirective && (
        <div className="mt-4 space-y-3 border-t border-gold/10 pt-4">
          <div className="space-y-2">
            <Label htmlFor={`close-${request.id}`}>Note (optional)</Label>
            <Textarea
              id={`close-${request.id}`}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={2}
              placeholder="Acknowledge his answer…"
              className="border-gold/20 bg-void/60"
            />
          </div>
          <Button
            onClick={() => void closeDirective()}
            disabled={busy !== null}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {busy === "close" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Close directive
          </Button>
        </div>
      )}

      {!isQueen && request.status === "pending" && isDirective && (
        <div className="mt-4 space-y-3 border-t border-gold/10 pt-4">
          <div className="space-y-2">
            <Label htmlFor={`slave-resp-${request.id}`}>Your formal response</Label>
            <Textarea
              id={`slave-resp-${request.id}`}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={3}
              placeholder="Answer Queen directly…"
              className="border-gold/20 bg-void/60"
            />
          </div>
          <Button
            onClick={() => void submitSlaveResponse()}
            disabled={busy !== null || !response.trim()}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {busy === "respond" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="mr-2 h-4 w-4" />
            )}
            Submit response
          </Button>
        </div>
      )}

      {isQueen && request.status === "pending" && !isDirective && (
        <div className="mt-4 space-y-3 border-t border-gold/10 pt-4">
          <div className="space-y-2">
            <Label htmlFor={`resp-${request.id}`}>Reply (optional)</Label>
            <Textarea
              id={`resp-${request.id}`}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={2}
              placeholder="Your answer…"
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28 space-y-1">
              <Label
                htmlFor={`charge-${request.id}`}
                className="text-[10px] text-muted-foreground"
              >
                Charge points (optional)
              </Label>
              <Input
                id={`charge-${request.id}`}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={pointCostInput}
                onChange={(e) => setPointCostInput(e.target.value)}
                placeholder="0"
                disabled={busy !== null}
                className="h-9 border-gold/20 bg-void/60"
              />
            </div>
            <Button
              onClick={() => void respond("approved")}
              disabled={busy !== null}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {busy === "approve" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Grant
            </Button>
            <Button
              variant="destructive"
              onClick={() => void respond("denied")}
              disabled={busy !== null}
            >
              {busy === "deny" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Deny
            </Button>
          </div>
        </div>
      )}

      {((!isQueen && request.status === "pending" && !isDirective) ||
        canDelete) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!isQueen && request.status === "pending" && !isDirective && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void withdraw()}
              disabled={busy !== null}
              className="border-muted text-muted-foreground"
            >
              {busy === "withdraw" ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Withdraw
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void remove()}
              disabled={busy !== null}
              className="border-red-500/30 text-red-300 hover:bg-red-950/30 hover:text-red-200"
            >
              {busy === "delete" ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-3.5 w-3.5" />
              )}
              Delete
            </Button>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-gold/10 pt-4">
        <VoiceNotes
          entityType="request"
          entityId={request.id}
          title="Voice on this request"
          compact
        />
      </div>
    </article>
  );
}
