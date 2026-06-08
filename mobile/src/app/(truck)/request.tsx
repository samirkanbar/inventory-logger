import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";

interface CatalogItem {
  id: number;
  name: string;
  unit: string | null;
  category: string | null;
}

interface RequestLine {
  key: string;
  item_id: number | null; // null = custom (new) item
  name: string;
  unit: string | null;
  quantity: number;
}

export default function Request() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<RequestLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live catalog suggestions as the truck types.
  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      api<{ items: CatalogItem[] }>(`/catalog?q=${encodeURIComponent(term)}`)
        .then((r) => !cancelled && setResults(r.items))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  const term = search.trim();
  const exactMatch = results.some((r) => r.name.toLowerCase() === term.toLowerCase());
  const alreadyCustom = lines.some(
    (l) => l.item_id === null && l.name.toLowerCase() === term.toLowerCase()
  );

  function addCatalog(it: CatalogItem) {
    setLines((prev) => {
      const existing = prev.find((l) => l.item_id === it.id);
      if (existing) {
        return prev.map((l) => (l.item_id === it.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        { key: `c${it.id}`, item_id: it.id, name: it.name, unit: it.unit, quantity: 1 },
      ];
    });
    setSearch("");
    setResults([]);
  }

  function addCustom(name: string) {
    const n = name.trim();
    if (!n) return;
    setLines((prev) => [
      ...prev,
      { key: `x${n.toLowerCase()}-${prev.length}`, item_id: null, name: n, unit: null, quantity: 1 },
    ]);
    setSearch("");
    setResults([]);
  }

  function setQty(key: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, qty) } : l))
    );
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function submit() {
    if (lines.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      await api("/requests", {
        method: "POST",
        json: {
          items: lines.map((l) =>
            l.item_id
              ? { item_id: l.item_id, quantity: l.quantity }
              : { custom_name: l.name, quantity: l.quantity }
          ),
        },
      });
      setDone(true);
      setLines([]);
      setSearch("");
      setResults([]);
    } catch (e: any) {
      setError(e?.message || "Could not send request");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView className="flex-1 bg-amber-50 items-center justify-center p-6" edges={["top"]}>
        <View className="w-full max-w-md bg-white rounded-2xl p-6 border border-amber-200">
          <Text className="text-xs uppercase tracking-wider text-amber-800 font-semibold">Sent</Text>
          <Text className="text-xl font-semibold text-stone-900 mt-1">Request sent</Text>
          <Text className="mt-2 text-stone-700">Your admins have been notified.</Text>
          <Pressable onPress={() => setDone(false)} className="mt-5 rounded-xl bg-stone-900 py-3">
            <Text className="text-center text-amber-50 font-semibold">New request</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <SafeAreaView className="flex-1 bg-amber-50" edges={["top"]}>
      <View className="px-4 py-3 border-b border-amber-300">
        <Text className="text-xl font-bold text-stone-900">Request items</Text>
        <Text className="text-sm text-stone-600 mt-0.5">
          Search to add, or type something new. Add as many as you need.
        </Text>
      </View>

      {/* Search + suggestions */}
      <View className="px-4 pt-3">
        <TextInput
          placeholder="Search items… (e.g. Milk, cupcakes)"
          placeholderTextColor="#a8a29e"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900"
        />
        {term.length > 0 && (
          <View className="mt-1 rounded-xl border border-stone-200 bg-white overflow-hidden">
            {searching && <ActivityIndicator color="#78350f" className="my-3" />}
            {results.slice(0, 6).map((it) => (
              <Pressable
                key={it.id}
                onPress={() => addCatalog(it)}
                className="px-4 py-3 border-b border-stone-100 flex-row items-center justify-between"
              >
                <View>
                  <Text className="text-stone-900 font-medium">{it.name}</Text>
                  {it.category ? <Text className="text-xs text-stone-500">{it.category}</Text> : null}
                </View>
                <Text className="text-amber-700 font-bold text-lg">＋</Text>
              </Pressable>
            ))}
            {!exactMatch && !alreadyCustom && (
              <Pressable onPress={() => addCustom(term)} className="px-4 py-3 bg-amber-50">
                <Text className="text-stone-800">
                  ＋ Add <Text className="font-bold">“{term}”</Text> as a new item
                </Text>
              </Pressable>
            )}
            {!searching && results.length === 0 && exactMatch === false && term.length === 0 && (
              <Text className="px-4 py-3 text-stone-500">Type to search…</Text>
            )}
          </View>
        )}
      </View>

      {/* The request list */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {lines.length === 0 ? (
          <View className="bg-white border border-amber-200 rounded-2xl p-6 mt-2">
            <Text className="text-stone-600 text-center">
              Nothing added yet. Search above and tap to build your list.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {lines.map((l) => (
              <View
                key={l.key}
                className="flex-row items-center justify-between bg-white rounded-xl border border-stone-300 px-3 py-2.5"
              >
                <View className="flex-1 pr-2">
                  <Text className="font-bold text-stone-900">{l.name}</Text>
                  {l.item_id === null ? (
                    <Text className="text-xs text-amber-700">new item</Text>
                  ) : l.unit ? (
                    <Text className="text-xs text-stone-500">per {l.unit}</Text>
                  ) : null}
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={() => setQty(l.key, l.quantity - 1)}
                    className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-300 items-center justify-center"
                  >
                    <Text className="text-amber-900 text-xl font-bold leading-none">−</Text>
                  </Pressable>
                  <TextInput
                    value={String(l.quantity)}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    onChangeText={(t) => setQty(l.key, Math.max(1, Math.round(Number(t) || 1)))}
                    className="w-12 h-9 text-center font-bold text-stone-900 rounded-lg border border-amber-300 bg-white"
                  />
                  <Pressable
                    onPress={() => setQty(l.key, l.quantity + 1)}
                    className="w-9 h-9 rounded-lg bg-amber-700 items-center justify-center"
                  >
                    <Text className="text-amber-50 text-xl font-bold leading-none">＋</Text>
                  </Pressable>
                  <Pressable onPress={() => removeLine(l.key)} className="w-9 h-9 items-center justify-center">
                    <Text className="text-stone-400 text-xl">✕</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {error && <Text className="text-sm text-red-700 mt-3">{error}</Text>}
      </ScrollView>

      {/* Sticky submit */}
      {lines.length > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-amber-50 border-t-2 border-amber-300 px-4 pt-3 pb-8">
          <Pressable
            onPress={submit}
            disabled={submitting}
            className={`rounded-xl bg-stone-900 py-3 ${submitting ? "opacity-60" : ""}`}
          >
            {submitting ? (
              <ActivityIndicator color="#fffbeb" />
            ) : (
              <Text className="text-center text-amber-50 font-semibold">
                Send request · {lines.length} item{lines.length === 1 ? "" : "s"} ({totalQty})
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
