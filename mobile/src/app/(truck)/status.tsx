import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/money";

type Status = "open" | "sent" | "declined";

interface RequestRow {
  id: number;
  item_name: string;
  quantity: number | null;
  status: Status;
  created_at: string;
  resolved_at: string | null;
}

const BADGE: Record<Status, { label: string; bg: string; text: string }> = {
  open: { label: "Waiting", bg: "bg-amber-100", text: "text-amber-800" },
  sent: { label: "Sent", bg: "bg-green-100", text: "text-green-800" },
  declined: { label: "Declined", bg: "bg-red-100", text: "text-red-800" },
};

export default function MyRequests() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "history">("open");

  const load = useCallback(async () => {
    try {
      const r = await api<{ requests: RequestRow[] }>("/requests");
      setRows(r.requests);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your requests");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // A push tells the truck something changed, but they may also just tap over
  // from the Request tab — refresh whenever this screen comes back into view.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const open = useMemo(() => rows.filter((r) => r.status === "open"), [rows]);
  const history = useMemo(() => rows.filter((r) => r.status !== "open"), [rows]);
  const data = tab === "open" ? open : history;

  return (
    <SafeAreaView className="flex-1 bg-amber-50" edges={["top"]}>
      <View className="px-4 py-4 border-b border-amber-300 bg-amber-100">
        <Text className="text-xs uppercase tracking-wider text-amber-800 font-bold">
          Nothing to do here — just checking
        </Text>
        <Text className="text-3xl font-bold text-stone-900 mt-0.5">My requests</Text>
        <Text className="text-sm text-stone-700 mt-1">
          What you've asked for and whether your admin has sent it.
        </Text>
      </View>

      <View className="flex-row rounded-xl bg-amber-100 border border-amber-300 p-1 mx-4 mt-3">
        <Pressable
          onPress={() => setTab("open")}
          className={`flex-1 py-2 rounded-lg ${tab === "open" ? "bg-white shadow-sm" : ""}`}
        >
          <Text
            className={`text-center font-semibold ${
              tab === "open" ? "text-stone-900" : "text-stone-500"
            }`}
          >
            Waiting{open.length ? ` (${open.length})` : ""}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("history")}
          className={`flex-1 py-2 rounded-lg ${tab === "history" ? "bg-white shadow-sm" : ""}`}
        >
          <Text
            className={`text-center font-semibold ${
              tab === "history" ? "text-stone-900" : "text-stone-500"
            }`}
          >
            Answered{history.length ? ` (${history.length})` : ""}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#78350f" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#78350f" />
          }
          ListHeaderComponent={
            error ? (
              <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-2">
                <Text className="text-red-800 text-sm">{error}</Text>
                <Text className="text-red-700 text-xs mt-1">Pull down to try again.</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="bg-white border border-amber-200 rounded-2xl p-6 mt-8">
              <Text className="text-stone-600 text-center">
                {tab === "open"
                  ? "Nothing waiting. Anything you request from the Request tab shows up here until your admin handles it."
                  : "Nothing answered yet. Once your admin marks a request Sent or Declined, it moves here."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = BADGE[item.status];
            return (
              <View className="bg-white rounded-2xl border border-stone-300 p-4">
                <View className="flex-row items-start justify-between">
                  <Text className="font-bold text-stone-900 text-base flex-1 pr-2">
                    {item.item_name}
                    {item.quantity ? (
                      <Text className="text-stone-700">  × {item.quantity}</Text>
                    ) : null}
                  </Text>
                  <View className={`rounded-full px-2.5 py-0.5 ${badge.bg}`}>
                    <Text className={`text-xs font-semibold ${badge.text}`}>{badge.label}</Text>
                  </View>
                </View>
                <Text className="text-xs text-stone-400 mt-2">
                  {item.status === "open"
                    ? `Requested ${formatDateTime(item.created_at)}`
                    : `${badge.label} ${formatDateTime(item.resolved_at ?? item.created_at)}`}
                </Text>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
