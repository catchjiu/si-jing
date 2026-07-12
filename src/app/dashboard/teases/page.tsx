"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Lock,
  Sparkles,
  X,
} from "lucide-react";
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

function isTimeUnlocked(unlocksAt: string) {
  return new Date(unlocksAt) <= new Date();
}

async function withSignedUrls(
  teases: TeaseWithSignedUrl[],
  { isQueen }: { isQueen: boolean }
): Promise<TeaseWithSignedUrl[]> {
  const supabase = createClient();
  return Promise.all(
    teases.map(async (t) => {
      if (!t.image_path) return t;
      const unlocked = isTimeUnlocked(t.unlocks_at);
      // Queen always sees the image; D only after time unlock (blurred or clear)
      if (!isQueen && !unlocked) return { ...t, signedUrl: undefined };
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
  const [startBlurred, setStartBlurred] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("teases")
      .select("*")
      .order("created_at", { ascending: false });
    if (isSlave) query = query.eq("sent_to", profile.id);
    const { data } = await query;
    const signed = await withSignedUrls((data ?? []) as TeaseWithSignedUrl[], {
      isQueen: !!isQueen,
    });
    setItems(signed);
    setLoading(false);
  }, [profile, isSlave, isQueen]);

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
    if (next) setStartBlurred(true);
  };

  const createTease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile || !recipient) return;
    const unlocks = unlockLocal ? new Date(unlockLocal) : new Date();
    if (Number.isNaN(unlocks.getTime())) {
      toast.error("Pick a valid unlock time");
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

      const blurred = !!imagePath && startBlurred;

      const { error } = await supabase.from("teases").insert({
        sent_by: profile.id,
        sent_to: recipient.id,
        title: title.trim() || null,
        message: message.trim() || null,
        image_path: imagePath,
        unlocks_at: unlocks.toISOString(),
        is_blurred: blurred,
        unblurred_at: blurred ? null : new Date().toISOString(),
      });
      if (error) throw error;

      toast.success(blurred ? "Blurred tease queued" : "Tease queued");
      setTitle("");
      setMessage("");
      setUnlockLocal("");
      setStartBlurred(true);
      setImage(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create tease");
    } finally {
      setSubmitting(false);
    }
  };

  const setBlurred = async (tease: TeaseWithSignedUrl, blurred: boolean) => {
    if (!isQueen) return;
    setToggling(tease.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("teases")
      .update({
        is_blurred: blurred,
        unblurred_at: blurred ? null : new Date().toISOString(),
      })
      .eq("id", tease.id);
    setToggling(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(blurred ? "Image blurred again" : "Image revealed");
    void load();
  };

  const markViewed = async (tease: TeaseWithSignedUrl) => {
    if (!isSlave || !profile || tease.viewed_at) return;
    if (!isTimeUnlocked(tease.unlocks_at) || tease.is_blurred) return;
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
            ? "Send a blurred tease — reveal the picture when you decide"
            : "Blurred gifts — Queen decides when you may see clearly"}
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
            <Label>Available from (optional)</Label>
            <Input
              type="datetime-local"
              value={unlockLocal}
              onChange={(e) => setUnlockLocal(e.target.value)}
              className="border-gold/20 bg-void/60"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to make it available now (still blurred if you choose)
            </p>
          </div>
          <div className="space-y-2">
            <Label>Image (optional)</Label>
            {preview ? (
              <div className="relative overflow-hidden rounded-lg border border-gold/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Preview"
                  className={cn(
                    "max-h-64 w-full object-contain bg-void transition",
                    startBlurred && "scale-110 blur-2xl"
                  )}
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
          {file && (
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gold/15 bg-void/40 px-4 py-3">
              <input
                type="checkbox"
                checked={startBlurred}
                onChange={(e) => setStartBlurred(e.target.checked)}
                className="size-4 accent-[var(--gold,#d4af37)]"
              />
              <span className="text-sm text-ivory">
                Start blurred — I will reveal it later
              </span>
            </label>
          )}
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
            const timeReady = isTimeUnlocked(t.unlocks_at);
            const showImage = isQueen || timeReady;
            const visuallyBlurred = !!t.image_path && t.is_blurred;
            const fullyRevealed = showImage && !visuallyBlurred;

            return (
              <article
                key={t.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-charcoal/80",
                  fullyRevealed ? "border-gold/30" : "border-gold/15"
                )}
                onClick={() => fullyRevealed && void markViewed(t)}
              >
                <div className="relative aspect-[4/5] bg-void overflow-hidden">
                  {!showImage ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                      <Lock className="h-8 w-8 text-gold/50" />
                      <p className="font-heading text-ivory">
                        {t.title || "Locked tease"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Available {formatDeadline(t.unlocks_at)}
                      </p>
                    </div>
                  ) : t.signedUrl ? (
                    <>
                      <Image
                        src={t.signedUrl}
                        alt={t.title || "Tease"}
                        fill
                        unoptimized
                        className={cn(
                          "object-cover transition duration-700",
                          visuallyBlurred &&
                            "scale-125 blur-3xl brightness-75 saturate-50"
                        )}
                        sizes="50vw"
                      />
                      {visuallyBlurred && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-void/20 p-4 text-center">
                          <EyeOff className="h-7 w-7 text-gold/80" />
                          <p className="font-heading text-ivory drop-shadow">
                            {t.title || "Blurred tease"}
                          </p>
                          <p className="text-xs text-ivory/70">
                            {isQueen
                              ? "D sees this blurred until you reveal"
                              : "Waiting for Queen to reveal"}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center p-4">
                      <Sparkles className="h-8 w-8 text-gold/40" />
                    </div>
                  )}
                </div>

                <div className="space-y-3 p-4">
                  <div className="space-y-1">
                    <p className="font-heading text-ivory">
                      {t.title || (fullyRevealed ? "Unlocked" : "Tease")}
                    </p>
                    {(fullyRevealed || isQueen) && t.message && (
                      <p
                        className={cn(
                          "whitespace-pre-wrap text-sm text-ivory/80",
                          visuallyBlurred && isSlave && "blur-sm select-none"
                        )}
                      >
                        {t.message}
                      </p>
                    )}
                    {!fullyRevealed && isSlave && t.message && (
                      <p className="text-xs text-muted-foreground italic">
                        Message hidden until reveal
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {visuallyBlurred
                        ? "Blurred"
                        : t.unblurred_at
                          ? `Revealed ${formatRelative(t.unblurred_at)}`
                          : timeReady
                            ? `Available ${formatRelative(t.unlocks_at)}`
                            : `Available ${formatDeadline(t.unlocks_at)}`}
                      {t.viewed_at ? " · viewed" : ""}
                    </p>
                  </div>

                  {isQueen && t.image_path && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={toggling === t.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void setBlurred(t, !t.is_blurred);
                      }}
                      className={
                        t.is_blurred
                          ? "bg-gold text-void hover:bg-gold-muted"
                          : "border border-muted bg-transparent text-ivory hover:bg-void/60"
                      }
                    >
                      {toggling === t.id ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : t.is_blurred ? (
                        <Eye className="mr-2 h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="mr-2 h-3.5 w-3.5" />
                      )}
                      {t.is_blurred ? "Reveal image" : "Blur again"}
                    </Button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
