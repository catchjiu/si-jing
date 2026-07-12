"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { RequestType } from "@/lib/types";
import { REQUEST_TYPE_LABELS, DIRECTIVE_TYPES } from "@/lib/requests";
import { formatRoleSpeech } from "@/lib/role-speech";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface QueenDirectiveFormProps {
  onSuccess?: () => void;
  className?: string;
}

export function QueenDirectiveForm({
  onSuccess,
  className,
}: QueenDirectiveFormProps) {
  const { profile, isQueen } = useAuth();
  const [type, setType] = useState<RequestType>("directive");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [slaveId, setSlaveId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isQueen) return;
    const supabase = createClient();
    void supabase
      .from("users")
      .select("id")
      .eq("role", "slave")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSlaveId(data.id as string);
      });
  }, [isQueen]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile || !slaveId) {
      toast.error("Could not find slave account");
      return;
    }
    if (!title.trim()) {
      toast.error("Give your directive a title");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.from("requests").insert({
        requested_by: profile.id,
        assigned_to: slaveId,
        direction: "directive",
        request_type: type,
        title: formatRoleSpeech(title.trim(), "queen"),
        message: message.trim()
          ? formatRoleSpeech(message.trim(), "queen")
          : null,
        desire_level: 0,
        status: "pending",
      });

      if (error) throw error;

      toast.success("Directive sent");
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Directive from Queen",
          body: title.trim(),
          url: "/dashboard/requests",
          target: "slave",
        })
      );
      setTitle("");
      setMessage("");
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send directive";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isQueen) return null;

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "space-y-6 rounded-xl border border-royal/40 bg-charcoal/80 p-5 sm:p-6",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-royal/30">
          <Crown className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h3 className="font-heading text-xl text-ivory">Send a Directive</h3>
          <p className="text-xs text-muted-foreground">
            Questions or orders D must respond to
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as RequestType)}>
          <SelectTrigger className="w-full border-gold/20 bg-void/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTIVE_TYPES.map((key) => (
              <SelectItem key={key} value={key}>
                {REQUEST_TYPE_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="directive-title">Title</Label>
        <Input
          id="directive-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Reflect on today…"
          className="border-gold/20 bg-void/60"
          required
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="directive-message">Details (optional)</Label>
        <Textarea
          id="directive-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What you expect in his response…"
          rows={3}
          className="border-gold/20 bg-void/60"
        />
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-royal text-ivory hover:bg-royal/80"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <MessageSquare className="mr-2 h-4 w-4" />
            Send directive
          </>
        )}
      </Button>
    </form>
  );
}
