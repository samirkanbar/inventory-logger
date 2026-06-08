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

export default function Request() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search the full catalog as the truck types.
  useEffect(() => {
    if (selected) return; // not searching while an item is chosen
    const term = search.trim();
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      api<{ items: CatalogItem[] }>(`/catalog?q=${encodeURIComponent(term)}`)
        .then((r) => {
          if (!cancelled) setResults(r.items);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, selected]);

  const exactMatch = results.some((r) => r.name.toLowerCase() === search.trim().toLowerCase());
  const canRequestCustom = search.trim().length > 0 && !exactMatch && !selected;
  const canSubmit = !!selected || search.trim().length > 0;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const payload: any = {};
      if (selected) payload.item_id = selected.id;
      else payload.custom_name = search.trim();
      if (qty.trim()) payload.quantity = Math.max(1, Math.round(Number(qty) || 0));
      if (note.trim()) payload.note = note.trim();
      await api("/requests", { method: "POST", json: payload });
      setDone(true);
      setSelected(null);
      setSearch("");
      setQty("");
      setNote("");
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
            <Text className="text-center text-amber-50 font-semibold">Request another</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-amber-50" edges={["top"]}>
      <View className="px-4 py-3 border-b border-amber-300">
        <Text className="text-xl font-bold text-stone-900">Request an item</Text>
        <Text className="text-sm text-stone-600 mt-0.5">
          Missing something? Ask your admin for it.
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {/* What do you need */}
        <Text className="text-sm font-semibold text-stone-700 mb-1">What do you need?</Text>
        {selected ? (
          <View className="flex-row items-center justify-between rounded-xl border border-amber-300 bg-white px-4 py-3">
            <View>
              <Text className="font-bold text-stone-900">{selected.name}</Text>
              {selected.unit && <Text className="text-xs text-stone-500">per {selected.unit}</Text>}
            </View>
            <Pressable onPress={() => setSelected(null)}>
              <Text className="text-stone-500 text-sm underline">Change</Text>
            </Pressable>
          </View>
        ) : (
          <TextInput
            placeholder="e.g. Milk, cupcakes…"
            placeholderTextColor="#a8a29e"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900"
          />
        )}

        {/* Catalog matches */}
        {!selected && (
          <View className="mt-2">
            {searching && <ActivityIndicator color="#78350f" className="my-2" />}
            {results.slice(0, 8).map((it) => (
              <Pressable
                key={it.id}
                onPress={() => setSelected(it)}
                className="px-4 py-3 border-b border-stone-100 bg-white"
              >
                <Text className="text-stone-900 font-medium">{it.name}</Text>
                {it.category && <Text className="text-xs text-stone-500">{it.category}</Text>}
              </Pressable>
            ))}
            {canRequestCustom && (
              <View className="mt-2 rounded-xl bg-amber-100 border border-amber-300 px-4 py-3">
                <Text className="text-stone-800">
                  Not in the list — you’ll request{" "}
                  <Text className="font-bold">“{search.trim()}”</Text> as a new item.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Quantity */}
        <Text className="text-sm font-semibold text-stone-700 mb-1 mt-5">Quantity (optional)</Text>
        <TextInput
          placeholder="e.g. 2"
          placeholderTextColor="#a8a29e"
          value={qty}
          onChangeText={setQty}
          keyboardType="number-pad"
          className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900"
        />

        {/* Note */}
        <Text className="text-sm font-semibold text-stone-700 mb-1 mt-5">Note (optional)</Text>
        <TextInput
          placeholder="Anything the admin should know"
          placeholderTextColor="#a8a29e"
          value={note}
          onChangeText={setNote}
          multiline
          className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900 h-20"
          style={{ textAlignVertical: "top" }}
        />

        {error && <Text className="text-sm text-red-700 mt-3">{error}</Text>}

        <Pressable
          onPress={submit}
          disabled={!canSubmit || submitting}
          className={`mt-6 rounded-xl bg-stone-900 py-3 ${!canSubmit || submitting ? "opacity-60" : ""}`}
        >
          {submitting ? (
            <ActivityIndicator color="#fffbeb" />
          ) : (
            <Text className="text-center text-amber-50 font-semibold">Send request</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
