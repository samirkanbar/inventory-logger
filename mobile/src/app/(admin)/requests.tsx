import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/money";

interface RequestRow {
  id: number;
  truck_name: string;
  item_name: string;
  quantity: number | null;
  note: string | null;
  status: string;
  created_at: string;
}

export default function AdminRequests() {
  const { me, logout } = useAuth();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ requests: RequestRow[] }>("/requests");
      setRows(r.requests);
    } catch {
      // ignore; pull to refresh to retry
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

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#78350f" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#78350f" />}
          ListEmptyComponent={
            <View className="bg-white border border-amber-200 rounded-2xl p-6 mt-8">
              <Text className="text-stone-600 text-center">
                No requests yet. When a location asks for something, it shows up here and pings your phone.
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
                <Text className="text-xs text-stone-400">{formatDateTime(item.created_at)}</Text>
              </View>
              <Text className="text-sm text-amber-800 font-medium mt-1">{item.truck_name}</Text>
              {item.note ? <Text className="text-sm text-stone-600 mt-1">“{item.note}”</Text> : null}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
