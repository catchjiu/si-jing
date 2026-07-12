"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { DesireRequest } from "@/lib/types";
import { desireColor, desireLabel, REQUEST_TYPE_LABELS } from "@/lib/requests";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { VoiceNotes } from "@/components/voice/voice-notes";

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
  const [busy, setBusy] = useState<"approve" | "deny" | "withdraw" | null>(
    null
  );

  const respond = async (decision: "approved" | "denied") => {
    setBusy(decision === "approved" ? "approve" : "deny");
    const supabase = createClient();
    const { error } = await supabase
      .from("requests")
      .update({
        status: decision,
        queen_response: response.trim() || null,
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
            <h3 className="font-heading text-lg text-ivory">{request.title}</h3>
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
              {REQUEST_TYPE_LABELS[request.request_type]}
            </Badge>
          </div>
          {request.message && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {request.message}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {formatRelative(request.created_at)}
          </p>
        </div>

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
      </div>

      {/* Desire meter */}
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

      {request.queen_response && (
        <div className="mt-4 rounded-lg border border-gold/20 bg-royal/20 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gold mb-1">
            Queen&apos;s reply
          </p>
          <p className="text-sm text-ivory/90 whitespace-pre-wrap">
            {request.queen_response}
          </p>
        </div>
      )}

      {isQueen && request.status === "pending" && (
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

      {!isQueen && request.status === "pending" && (
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
