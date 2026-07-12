"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Task } from "@/lib/types";

export default function ProfilePage() {
  const { profile, role, refreshProfile, loading: authLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    pending: 0,
  });

  useEffect(() => {
    if (profile) setUsername(profile.username);
  }, [profile]);

  useEffect(() => {
    const loadStats = async () => {
      if (!profile) return;
      const supabase = createClient();
      const column = role === "queen" ? "assigned_by" : "assigned_to";
      const { data } = await supabase
        .from("tasks")
        .select("status")
        .eq(column, profile.id);

      const tasks = (data ?? []) as Pick<Task, "status">[];
      setStats({
        total: tasks.length,
        approved: tasks.filter((t) => t.status === "approved").length,
        pending: tasks.filter((t) =>
          ["pending", "in_progress", "submitted"].includes(t.status)
        ).length,
      });
    };
    void loadStats();
  }, [profile, role]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ username: username.trim() })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error("Could not update profile");
      return;
    }
    await refreshProfile();
    toast.success("Profile updated");
  };

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const supabase = createClient();
    const path = `avatars/${profile.id}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Avatar upload failed");
      return;
    }

    const { data } = await supabase.storage
      .from("submissions")
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    const { error } = await supabase
      .from("users")
      .update({ avatar_url: data?.signedUrl ?? path })
      .eq("id", profile.id);

    if (error) {
      toast.error("Could not save avatar");
      return;
    }
    await refreshProfile();
    toast.success("Avatar updated");
  };

  if (authLoading || !profile) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const initials = profile.username
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="font-heading text-3xl text-ivory">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your presence in the sanctum
        </p>
      </div>

      <div className="rounded-xl border border-gold/15 bg-charcoal/80 p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {profile.avatar_url && (
              <AvatarImage src={profile.avatar_url} alt={profile.username} />
            )}
            <AvatarFallback className="bg-royal text-gold text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-heading text-xl text-ivory">{profile.username}</p>
            <Badge
              variant="outline"
              className="mt-1 border-gold/40 text-gold uppercase text-[10px] tracking-wider"
            >
              {role}
            </Badge>
            <p className="mt-2 text-xs text-muted-foreground">{profile.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: stats.total },
            { label: "Approved", value: stats.approved },
            { label: "Active", value: stats.pending },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-gold/10 bg-void/50 p-3 text-center"
            >
              <p className="font-heading text-2xl text-gold">{s.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <form onSubmit={onSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Display name</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="border-gold/20 bg-void/60"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avatar">Avatar</Label>
            <Input
              id="avatar"
              type="file"
              accept="image/*"
              onChange={onAvatar}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </div>
    </div>
  );
}
