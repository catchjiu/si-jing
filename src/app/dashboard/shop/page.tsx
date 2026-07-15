"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Check,
  Coins,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Store,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  adjustPoints,
  fetchPointsBalance,
  fetchPointsLedger,
  purchaseShopItem,
  type PointsLedgerEntry,
  type ShopItem,
  type ShopPurchaseWithItem,
} from "@/lib/points";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { presignAndUpload, signObjectUrl } from "@/lib/storage/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type ShopItemView = ShopItem & { signedUrl?: string };

export default function ShopPage() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [items, setItems] = useState<ShopItemView[]>([]);
  const [purchases, setPurchases] = useState<ShopPurchaseWithItem[]>([]);
  const [ledger, setLedger] = useState<PointsLedgerEntry[]>([]);
  const [slaveId, setSlaveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(25);
  const [file, setFile] = useState<File | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  const [adjustDelta, setAdjustDelta] = useState(10);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();

    let targetSlave = slaveId;
    if (!targetSlave) {
      const { data } = await supabase
        .from("users")
        .select("id")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      targetSlave = (data?.id as string | undefined) ?? null;
      setSlaveId(targetSlave);
    }

    const balanceUser = isSlave ? profile.id : targetSlave;
    const [bal, itemRows, purchaseRows, ledgerRows] = await Promise.all([
      balanceUser
        ? fetchPointsBalance(supabase, balanceUser)
        : Promise.resolve(0),
      supabase
        .from("shop_items")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase
        .from("shop_purchases")
        .select("*, item:shop_items(*)")
        .order("created_at", { ascending: false })
        .limit(40),
      balanceUser
        ? fetchPointsLedger(supabase, balanceUser, 25)
        : Promise.resolve([]),
    ]);

    if (itemRows.error) toast.error(itemRows.error.message);
    if (purchaseRows.error) toast.error(purchaseRows.error.message);

    const withUrls: ShopItemView[] = await Promise.all(
      ((itemRows.data ?? []) as ShopItem[]).map(async (item) => {
        if (!item.image_path) return item;
        const signedUrl =
          (await signObjectUrl({
            bucket: "messages",
            path: item.image_path,
          })) ?? undefined;
        return { ...item, signedUrl };
      })
    );

    setBalance(bal);
    setItems(withUrls);
    setPurchases((purchaseRows.data ?? []) as ShopPurchaseWithItem[]);
    setLedger(ledgerRows);
    setLoading(false);
  }, [profile, isSlave, slaveId]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile) return;
    if (!title.trim()) {
      toast.error("Give the prize a title");
      return;
    }
    if (price < 1) {
      toast.error("Price must be at least 1 point");
      return;
    }
    setSavingItem(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("shop_items")
        .insert({
          created_by: profile.id,
          title: formatRoleSpeech(title.trim(), "queen"),
          description: description.trim()
            ? formatRoleSpeech(description.trim(), "queen")
            : null,
          price,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (file && data?.id) {
        const prepared = await downsizeImageIfNeeded(file);
        const ext = prepared.name.split(".").pop() || "jpg";
        const relativePath = `${profile.id}/shop/${data.id}/${Date.now()}.${ext}`;
        const uploaded = await presignAndUpload({
          bucket: "messages",
          relativePath,
          file: prepared,
        });
        if (uploaded) {
          await supabase
            .from("shop_items")
            .update({ image_path: uploaded })
            .eq("id", data.id);
        }
      }

      toast.success("Shop item added");
      setTitle("");
      setDescription("");
      setPrice(25);
      setFile(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add item");
    } finally {
      setSavingItem(false);
    }
  };

  const toggleActive = async (item: ShopItem) => {
    if (!isQueen) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("shop_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void load();
  };

  const buy = async (item: ShopItem) => {
    if (!isSlave) return;
    const supabase = createClient();
    const result = await purchaseShopItem(supabase, item.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Purchased “${item.title}”`);
    void load();
  };

  const fulfill = async (purchaseId: string) => {
    if (!isQueen) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("shop_purchases")
      .update({
        status: "fulfilled",
        fulfilled_at: new Date().toISOString(),
      })
      .eq("id", purchaseId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Marked fulfilled");
    void load();
  };

  const onAdjust = async (sign: 1 | -1) => {
    if (!isQueen || !profile || !slaveId) return;
    const delta = Math.abs(adjustDelta) * sign;
    if (!delta) return;
    setAdjusting(true);
    const result = await adjustPoints(createClient(), {
      userId: slaveId,
      delta,
      reason: adjustReason.trim() || (delta > 0 ? "Queen award" : "Queen deduction"),
      createdBy: profile.id,
    });
    setAdjusting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(delta > 0 ? `Awarded ${delta} points` : `Deducted ${Math.abs(delta)} points`);
    setAdjustReason("");
    void load();
  };

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const visibleItems = isQueen ? items : items.filter((i) => i.is_active);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-ivory flex items-center gap-3">
            <Store className="h-7 w-7 text-gold" />
            Shop
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isQueen
              ? "Set prizes and manage D’s good-boy points"
              : "Spend good-boy points on prizes Queen offers"}
          </p>
        </div>
        <div className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-right">
          <p className="text-[10px] uppercase tracking-wider text-gold/80">
            {isQueen ? "D’s balance" : "Your points"}
          </p>
          <p className="font-heading text-3xl text-gold tabular-nums flex items-center justify-end gap-2">
            <Coins className="h-5 w-5" />
            {loading ? "…" : balance}
          </p>
        </div>
      </div>

      {isQueen && (
        <section className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={(e) => void createItem(e)}
            className="space-y-4 rounded-xl border border-gold/15 bg-charcoal/80 p-5"
          >
            <h2 className="font-heading text-xl text-ivory flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-gold" />
              Add shop item
            </h2>
            <div className="space-y-1.5">
              <Label htmlFor="shop-title">Title</Label>
              <Input
                id="shop-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mercy pass, custom reward…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shop-desc">Description</Label>
              <Textarea
                id="shop-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What he gets"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="shop-price">Price (points)</Label>
                <Input
                  id="shop-price"
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-image">Image (optional)</Label>
                <Input
                  id="shop-image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <Button type="submit" disabled={savingItem}>
              {savingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add to shop
            </Button>
          </form>

          <div className="space-y-4 rounded-xl border border-gold/15 bg-charcoal/80 p-5">
            <h2 className="font-heading text-xl text-ivory flex items-center gap-2">
              <Coins className="h-5 w-5 text-gold" />
              Adjust points
            </h2>
            <p className="text-sm text-muted-foreground">
              Auto awards: +15 approved submission, +5 worship photo, +25 streak milestone.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="adj-amount">Amount</Label>
              <Input
                id="adj-amount"
                type="number"
                min={1}
                value={adjustDelta}
                onChange={(e) =>
                  setAdjustDelta(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-reason">Reason</Label>
              <Input
                id="adj-reason"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Good boy / rule break…"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={adjusting}
                onClick={() => void onAdjust(1)}
              >
                <Plus className="h-4 w-4" />
                Award
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-red-500/40 text-red-300"
                disabled={adjusting}
                onClick={() => void onAdjust(-1)}
              >
                <Minus className="h-4 w-4" />
                Deduct
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Prizes</h2>
        {loading && visibleItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : visibleItems.length === 0 ? (
          <p className="rounded-lg border border-gold/10 bg-charcoal/40 px-4 py-6 text-center text-sm text-muted-foreground">
            {isQueen ? "No shop items yet — add one above." : "No prizes available yet."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-charcoal/80",
                  item.is_active ? "border-gold/15" : "border-gold/5 opacity-60"
                )}
              >
                <div className="relative aspect-[4/3] bg-void">
                  {item.signedUrl ? (
                    <Image
                      src={item.signedUrl}
                      alt={item.title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ShoppingBag className="h-8 w-8 opacity-40" />
                    </div>
                  )}
                  <Badge className="absolute right-2 top-2 bg-gold text-void">
                    {item.price} pts
                  </Badge>
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <h3 className="font-heading text-lg text-ivory">{item.title}</h3>
                    {item.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                  {isSlave && (
                    <Button
                      type="button"
                      className="w-full"
                      disabled={balance < item.price}
                      onClick={() => void buy(item)}
                    >
                      {balance < item.price ? "Not enough points" : "Buy"}
                    </Button>
                  )}
                  {isQueen && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-gold/25"
                      onClick={() => void toggleActive(item)}
                    >
                      {item.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-heading text-xl text-gold">Purchases</h2>
          {purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchases yet.</p>
          ) : (
            <ul className="space-y-2">
              {purchases.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gold/10 bg-charcoal/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ivory">
                      {(p.item as ShopItem | null | undefined)?.title ?? "Item"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.price_paid} pts · {formatRelative(p.created_at)} · {p.status}
                    </p>
                  </div>
                  {isQueen && p.status === "pending" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-gold/30"
                      onClick={() => void fulfill(p.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Fulfill
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-heading text-xl text-gold">Ledger</h2>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No point activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {ledger.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gold/10 bg-charcoal/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ivory">{row.reason}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatRelative(row.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-heading text-lg tabular-nums",
                      row.delta > 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {row.delta > 0 ? "+" : ""}
                    {row.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
