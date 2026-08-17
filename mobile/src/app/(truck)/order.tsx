import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { categoryLabel, groupByCategory } from "@/lib/categories";

interface Item {
  id: number;
  name: string;
  unit: string | null;
  category: string | null;
  price_cents: number;
}

interface CartLine {
  item_id: number;
  name: string;
  quantity: number;
}

function QtyControl({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  if (qty === 0) {
    return (
      <Pressable onPress={() => onChange(1)} className="rounded-lg bg-amber-700 px-4 py-2">
        <Text className="text-amber-50 font-semibold text-sm">+ Add</Text>
      </Pressable>
    );
  }
  return (
    <View className="flex-row items-center gap-1.5">
      <Pressable
        onPress={() => onChange(qty - 1)}
        className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-300 items-center justify-center"
      >
        <Text className="text-amber-900 text-xl font-bold leading-none">−</Text>
      </Pressable>
      <TextInput
        value={String(qty)}
        keyboardType="number-pad"
        selectTextOnFocus
        onChangeText={(t) => onChange(Math.max(0, Math.round(Number(t) || 0)))}
        className="w-14 h-9 text-center font-bold text-stone-900 rounded-lg border border-amber-300 bg-white"
      />
      <Pressable
        onPress={() => onChange(qty + 1)}
        className="w-9 h-9 rounded-lg bg-amber-700 items-center justify-center"
      >
        <Text className="text-amber-50 text-xl font-bold leading-none">+</Text>
      </Pressable>
    </View>
  );
}

export default function Order() {
  const { me, logout } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Map<number, CartLine>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadItems = useCallback(() => {
    setLoading(true);
    api<{ items: Item[] }>("/items")
      .then((r) => {
        setItems(r.items);
        setLoadError(null);
      })
      .catch((e: any) => setLoadError(e?.message || "Couldn't load your item list"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items),
    [items, q]
  );
  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  const cartLines = useMemo(() => Array.from(cart.values()), [cart]);
  const totalQty = cartLines.reduce((s, l) => s + l.quantity, 0);

  function isOpen(category: string) {
    return q.length > 0 || expanded.has(category);
  }
  function toggle(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });
  }
  function setItemQty(item: Item, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(item.id);
      else next.set(item.id, { item_id: item.id, name: item.name, quantity: qty });
      return next;
    });
  }
  function cartCountFor(category: string): number {
    let n = 0;
    for (const it of items) {
      if (categoryLabel(it.category) !== category) continue;
      const line = cart.get(it.id);
      if (line) n += line.quantity;
    }
    return n;
  }

  async function submit() {
    if (!title.trim()) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await api("/submissions", {
        method: "POST",
        json: {
          title: title.trim(),
          items: cartLines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
        },
      });
      setCart(new Map());
      setTitle("");
      setConfirming(false);
      setSubmitted(true);
    } catch (e: any) {
      // Keep the modal open with the cart intact so they can retry — losing an
      // order to a dropped signal is the worst thing that can happen here.
      setSubmitError(e?.message || "Couldn't send the order. Check your signal and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-amber-50" edges={["top"]}>
      {/* Header */}
      <View className="px-4 py-4 border-b border-amber-300 bg-amber-100">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-xs uppercase tracking-wider text-amber-800 font-bold">
              {me?.label} · Weekly order
            </Text>
            <Text className="text-3xl font-bold text-stone-900 mt-0.5">Place an order</Text>
            <Text className="text-sm text-stone-700 mt-1">
              Pick everything you need this week, then review and submit.
            </Text>
          </View>
          <Pressable
            onPress={() => logout()}
            className="rounded-lg border border-stone-400 px-3 py-1.5"
          >
            <Text className="text-stone-700 text-sm font-medium">Log out</Text>
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View className="px-4 py-3 bg-amber-50">
        <TextInput
          placeholder="Search items…"
          placeholderTextColor="#a8a29e"
          value={query}
          onChangeText={setQuery}
          className="w-full rounded-xl border border-amber-300 bg-white px-4 py-3 text-stone-900"
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#78350f" />
        </View>
      ) : loadError ? (
        <View className="p-6 items-center">
          <Text className="text-stone-800 text-center font-medium">{loadError}</Text>
          <Text className="text-stone-600 text-center text-sm mt-1">
            Your items couldn't be loaded — this is usually signal, not a missing list.
          </Text>
          <Pressable onPress={loadItems} className="mt-4 rounded-xl bg-stone-900 px-5 py-3">
            <Text className="text-amber-50 font-semibold">Try again</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View className="p-6">
          <Text className="text-stone-700 text-center">
            No items yet. Your admin needs to upload an inventory list first.
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
          <View className="gap-3">
            {grouped.map(({ category, items: groupItems }) => {
              const open = isOpen(category);
              const cartN = cartCountFor(category);
              return (
                <View
                  key={category}
                  className="rounded-2xl border border-stone-300 overflow-hidden bg-white"
                >
                  <Pressable
                    onPress={() => toggle(category)}
                    disabled={q.length > 0}
                    className="flex-row items-center justify-between px-4 py-3 bg-amber-200"
                  >
                    <View className="flex-row items-center gap-3 flex-shrink">
                      <Text className="font-bold uppercase text-sm text-stone-900">{category}</Text>
                      <Text className="text-xs text-stone-500">
                        {groupItems.length} item{groupItems.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      {cartN > 0 && (
                        <View className="bg-amber-700 rounded-full px-2 py-0.5">
                          <Text className="text-amber-50 text-xs font-semibold">{cartN} in cart</Text>
                        </View>
                      )}
                      <Text className="text-stone-500">{open ? "▴" : "▾"}</Text>
                    </View>
                  </Pressable>

                  {open && (
                    <View>
                      {groupItems.map((it) => {
                        const qty = cart.get(it.id)?.quantity ?? 0;
                        return (
                          <View
                            key={it.id}
                            className={`flex-row items-center justify-between px-4 py-3 border-t border-stone-200 ${
                              qty > 0 ? "bg-amber-50" : "bg-white"
                            }`}
                          >
                            <View className="flex-1 pr-3">
                              <Text className="font-bold text-stone-900">{it.name}</Text>
                              {it.unit && (
                                <Text className="text-xs text-stone-500 mt-0.5">per {it.unit}</Text>
                              )}
                            </View>
                            <QtyControl qty={qty} onChange={(newQty) => setItemQty(it, newQty)} />
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
            {grouped.length === 0 && (
              <View className="bg-white border border-amber-200 rounded-2xl p-6">
                <Text className="text-stone-600 text-center">No matches for “{query}”.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Sticky cart footer */}
      {cartLines.length > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-amber-50 border-t-2 border-amber-300 px-4 pt-3 pb-8 flex-row items-center justify-between">
          <View>
            <Text className="font-semibold text-stone-900">
              {cartLines.length} item{cartLines.length === 1 ? "" : "s"} · {totalQty} qty
            </Text>
            <Pressable onPress={() => setCart(new Map())}>
              <Text className="text-xs text-stone-600 underline">Clear</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => setConfirming(true)}
            className="rounded-xl bg-stone-900 px-5 py-3"
          >
            <Text className="text-amber-50 font-semibold">Review &amp; submit</Text>
          </Pressable>
        </View>
      )}

      {/* Confirm modal */}
      <Modal visible={confirming} animationType="slide" transparent onRequestClose={() => setConfirming(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl p-5 max-h-[80%]">
            <Text className="text-xl font-semibold text-stone-900">Review order</Text>
            <TextInput
              placeholder="Order title (e.g. Morning shift)"
              placeholderTextColor="#a8a29e"
              value={title}
              onChangeText={setTitle}
              className="mt-3 rounded-xl border border-stone-300 px-4 py-3 text-stone-900"
            />
            <ScrollView className="mt-3" style={{ maxHeight: 280 }}>
              {cartLines.map((l) => (
                <View key={l.item_id} className="flex-row justify-between py-2 border-b border-stone-100">
                  <Text className="text-stone-800 flex-1 pr-2">{l.name}</Text>
                  <Text className="text-stone-900 font-semibold">× {l.quantity}</Text>
                </View>
              ))}
            </ScrollView>
            {submitError && (
              <View className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <Text className="text-red-800 text-sm">{submitError}</Text>
                <Text className="text-red-700 text-xs mt-0.5">
                  Your order wasn't sent. Nothing was lost — tap Submit to retry.
                </Text>
              </View>
            )}

            <View className="flex-row gap-3 mt-4">
              <Pressable
                onPress={() => setConfirming(false)}
                className="flex-1 rounded-xl border border-stone-300 py-3"
              >
                <Text className="text-center text-stone-700 font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={!title.trim() || submitting}
                className={`flex-1 rounded-xl bg-stone-900 py-3 ${
                  !title.trim() || submitting ? "opacity-60" : ""
                }`}
              >
                {submitting ? (
                  <ActivityIndicator color="#fffbeb" />
                ) : (
                  <Text className="text-center text-amber-50 font-semibold">Submit</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success modal */}
      <Modal visible={submitted} animationType="fade" transparent onRequestClose={() => setSubmitted(false)}>
        <View className="flex-1 bg-black/40 items-center justify-center p-4">
          <View className="w-full max-w-md bg-white rounded-2xl p-6">
            <Text className="text-xs uppercase tracking-wider text-amber-800 font-semibold">
              Submitted
            </Text>
            <Text className="text-xl font-semibold text-stone-900 mt-1">Order sent successfully</Text>
            <Text className="mt-2 text-stone-700">Your boss will see it instantly.</Text>
            <Pressable
              onPress={() => setSubmitted(false)}
              className="mt-5 rounded-xl bg-stone-900 py-3"
            >
              <Text className="text-center text-amber-50 font-semibold">Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
