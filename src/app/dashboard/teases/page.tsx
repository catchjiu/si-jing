"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { EyeOff, ImagePlus, Loader2, Lock, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatDeadline, formatRelative } from "@/lib/format";
import type { Profile, TeaseWithSignedUrl } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function withSignedUrls(
  teases: TeaseWithSignedUrl[]
): Promise<TeaseWithSignedUrl[]> {
  const supabase = createClient();
  return Promise.all(
    teases.map(async (t) => {
      if (!t.image_path) return t;
      const unlocked = new Date(t.unlocks_at) <= new Date();
      if (!unlocked) return { ...t, signedUrl: undefined };
      const { data } = await supabase.storage
        .from("teases")
        .createSignedUrl(t.image_path, 3600);
      return { ...t, signedUrl: data?.signedUrl };
    })
  );
}

export default function TeasesPage() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [items, setItems] = useState<TeaseWithSignedUrl[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [unlockLocal, setUnlockLocal] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("teases")
      .select("*")
      .order("unlocks_at", { ascending: true });
    if (isSlave) query = query.eq("sent_to", profile.id);
    const { data } = await query;
    const signed = await withSignedUrls((data ?? []) as TeaseWithSignedUrl[]);
    setItems(signed);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!isQueen) return;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      setRecipient((data as Profile | null) ?? null);
    })();
  }, [isQueen]);

  const setImage = (next: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  };

  const createTease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile || !recipient) return;
    const unlocks = unlockLocal ? new Date(unlockLocal) : null;
    if (!unlocks || Number.isNaN(unlocks.getTime())) {
      toast.error("Pick an unlock time");
      return;
    }
    if (!title.trim() && !message.trim() && !file) {
      toast.error("Add a title, message, or image");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    try {
      let imagePath: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        imagePath = `${profile.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("teases")
          .upload(imagePath, file, { upsert: false });
        if (uploadError) throw uploadError;
      }

      const { error } = await supabase.from("teases").insert({
        sent_by: profile.id,
        sent_to: recipient.id,
        title: title.trim() || null,
        message: message.trim() || null,
        image_path: imagePath,
        unlocks_at: unlocks.toISOString(),
      });
      if (error) throw error;

      toast.success("Tease queued");
      setTitle("");
      setMessage("");
      setUnlockLocal("");
      setImage(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create tease");
    } finally {
      setSubmitting(false);
    }
  };

  const markViewed = async (tease: TeaseWithSignedUrl) => {
    if (!isSlave || !profile || tease.viewed_at) return;
    if (new Date(tease.unlocks_at) > new Date()) return;
    const supabase = createClient();
    await supabase
      .from("teases")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", tease.id);
    void load();
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-3xl text-ivory">
          <Sparkles className="h-7 w-7 text-gold" />
          Teases
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Schedule delayed messages and images that unlock later"
            : "Locked gifts — wait for the unlock"}
        </p>
      </div>

      {isQueen && recipient && (
        <form
          onSubmit={createTease}
          className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-6"
        >
          <h2 className="font-heading text-xl text-gold">Queue a tease</h2>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="space-y-2">
            <Label>Unlocks at</Label>
            <Input
              type="datetime-local"
              value={unlockLocal}
              onChange={(e) => setUnlockLocal(e.target.value)}
              className="border-gold/20 bg-void/60"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Image (optional)</Label>
            {preview ? (
              <div className="relative overflow-hidden rounded-lg border border-gold/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-64 w-full object-contain bg-void"
                />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="absolute right-2 top-2 rounded-full bg-void/80 p-1.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-gold/25 px-4 py-8 hover:border-gold/50">
                <ImagePlus className="h-7 w-7 text-gold/70" />
                <span className="text-sm text-muted-foreground">
                  Drop or choose an image
                </span>
                <input
                  type="file"
                  accept={ACCEPTED.join(",")}
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && ACCEPTED.includes(f.type)) setImage(f);
                  }}
                />
              </label>
            )}
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <EyeOff className="mr-2 h-4 w-4" />
            )}
            Queue tease
          </Button>
        </form>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teases yet.</p>
        ) : (
          items.map((t) => {
            const unlocked = new Date(t.unlocks_at) <= new Date();
            return (
              <article
                key={t.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-charcoal/80",
                  unlocked ? "border-gold/30" : "border-gold/15"
                )}
                onClick={() => unlocked && void markViewed(t)}
              >
                <div className="relative aspect-[4/5] bg-void">
                  {!unlocked ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                      <Lock className="h-8 w-8 text-gold/50" />
                      <p className="font-heading text-ivory">
                        {t.title || "Locked tease"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Unlocks {formatDeadline(t.unlocks_at)}
                      </p>
                    </div>
                  ) : t.signedUrl ? (
                    <Image
                      src={t.signedUrl}
                      alt={t.title || "Tease"}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="50vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-4">
                      <Sparkles className="h-8 w-8 text-gold/40" />
                    </div>
                  )}
                </div>
                {unlocked && (
                  <div className="space-y-1 p-4">
                    <p className="font-heading text-ivory">
                      {t.title || "Unlocked"}
                    </p>
                    {t.message && (
                      <p className="whitespace-pre-wrap text-sm text-ivory/80">
                        {t.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Unlocked {formatRelative(t.unlocks_at)}
                      {t.viewed_at ? " · viewed" : ""}
                    </p>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
