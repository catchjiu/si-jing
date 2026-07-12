"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, MessageSquare, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { DesireRequest } from "@/lib/types";
import { desireColor, desireLabel, REQUEST_TYPE_LABELS } from "@/lib/requests";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { RequestThread } from "@/components/requests/request-thread";
import { RoleSpeech } from "@/components/ui/role-speech";

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
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState<
    "approve" | "deny" | "withdraw" | "respond" | "close" | null
  >(null);

  const isDirective = (request.direction ?? "petition") === "directive";

  const respond = async (decision: "approved" | "denied") => {
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
      })
      .eq("id", request.id);

    setBusy(null);
    if (error) {
      toast.error("Could not respond");
      return;
    }
    toast.success(decision === "approved" ? "Request approved" : "Request denied");
    setResponse("");
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: decision === "approved" ? "Request granted" : "Request denied",
        body: request.title,
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

  return (
    <article
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
          <p className="text-xs text-muted-foreground">
            {formatRelative(request.created_at)}
          </p>
        </div>

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
          <div className="flex flex-wrap gap-2">
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

      {!isQueen && request.status === "pending" && !isDirective && (
        <div className="mt-4">
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
