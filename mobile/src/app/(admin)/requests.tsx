import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/money";

type Status = "open" | "sent" | "declined";

interface RequestRow {
  id: number;
  truck_name: string;
  item_name: string;
  quantity: number | null;
  note: string | null;
  status: Status;
  created_at: string;
  resolved_at: string | null;
}

export default function AdminRequests() {
  const { me, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"open" | "history">("open");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ requests: RequestRow[] }>("/requests");
      setRows(r.requests);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load requests");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function setStatus(id: number, status: Status) {
    setBusyId(id);
    try {
      const r = await api<{ request: { id: number; status: Status; resolved_at: string | null } }>(
        "/requests",
        { method: "PATCH", json: { id, status } }
      );
      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? { ...row, status: r.request.status, resolved_at: r.request.resolved_at }
            : row
        )
      );
      setError(null);
    } catch (e: any) {
      // The row keeps its old status, so the admin can see it didn't take.
      setError(e?.message || "Couldn't update that request — it's unchanged.");
    } finally {
      setBusyId(null);
    }
  }

  const open = useMemo(() => rows.filter((r) => r.status === "open"), [rows]);
  const history = useMemo(() => rows.filter((r) => r.status !== "open"), [rows]);
  const data = tab === "open" ? open : history;

  return (
    <SafeAreaView className="flex-1 bg-amber-50" edges={["top"]}>
      {/* Header */}
      <View className="px-4 py-3 border-b border-amber-300 flex-row items-center justify-between">
        <View>
          <Text className="text-xl font-bold text-stone-900">Requests</Text>
          <Text className="text-xs text-stone-600">{me?.label}</Text>
        </View>
        <Pressable onPress={() => logout()} className="rounded-lg border border-stone-300 px-3 py-1.5">
          <Text className="text-stone-700 text-sm font-medium">Log out</Text>
        </Pressable>
      </View>

      {/* Open / History toggle — warm to match the rest of the app */}
      <View className="flex-row rounded-xl bg-amber-100 border border-amber-300 p-1 mx-4 mt-3">
        <Pressable
          onPress={() => setTab("open")}
          className={`flex-1 py-2 rounded-lg ${tab === "open" ? "bg-white shadow-sm" : ""}`}
        >
          <Text className={`text-center font-semibold ${tab === "open" ? "text-stone-900" : "text-stone-500"}`}>
            Open{open.length ? ` (${open.length})` : ""}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("history")}
          className={`flex-1 py-2 rounded-lg ${tab === "history" ? "bg-white shadow-sm" : ""}`}
        >
          <Text className={`text-center font-semibold ${tab === "history" ? "text-stone-900" : "text-stone-500"}`}>
            History{history.length ? ` (${history.length})` : ""}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#78350f" />}
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
                  ? "No open requests. When a location asks for something, it shows up here and pings your phone."
                  : "Nothing handled yet. Requests you mark Sent or Declined will appear here."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="bg-white rounded-2xl border border-stone-300 p-4">
              <View className="flex-row items-start justify-between">
                <Text className="font-bold text-stone-900 text-base flex-1 pr-2">
                  {item.item_name}
                  {item.quantity ? <Text className="text-stone-700">  × {item.quantity}</Text> : null}
                </Text>
                <Text className="text-xs text-stone-400">
                  {formatDateTime(item.resolved_at ?? item.created_at)}
                </Text>
              </View>
              <Text className="text-sm text-amber-800 font-medium mt-1">{item.truck_name}</Text>

              {tab === "open" ? (
                <View className="flex-row gap-2 mt-3">
                  {busyId === item.id ? (
                    <View className="flex-1 items-center py-2.5">
                      <ActivityIndicator color="#78350f" />
                    </View>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => setStatus(item.id, "sent")}
                        className="flex-1 rounded-xl bg-green-600 py-2.5 shadow-sm"
                      >
                        <Text className="text-center text-white font-semibold">Sent</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setStatus(item.id, "declined")}
                        className="flex-1 rounded-xl border border-red-300 py-2.5"
                      >
                        <Text className="text-center text-red-700 font-semibold">Decline</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              ) : (
                <View className="flex-row items-center justify-between mt-2">
                  <View
                    className={`rounded-full px-2.5 py-0.5 ${
                      item.status === "sent" ? "bg-green-100" : "bg-red-100"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        item.status === "sent" ? "text-green-800" : "text-red-800"
                      }`}
                    >
                      {item.status === "sent" ? "Sent" : "Declined"}
                    </Text>
                  </View>
                  <Pressable onPress={() => setStatus(item.id, "open")}>
                    <Text className="text-xs text-stone-500 underline">Reopen</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
