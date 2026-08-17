import { Tabs, Redirect } from "expo-router";
import { Text } from "react-native";
import { useAuth } from "@/lib/auth";

export default function TruckLayout() {
  const { me, loading } = useAuth();
  if (loading) return null;
  if (!me) return <Redirect href="/login" />;
  if (me.role !== "truck") return <Redirect href="/(admin)/requests" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#b45309",
        tabBarInactiveTintColor: "#78716c",
      }}
    >
      <Tabs.Screen
        name="order"
        options={{
          title: "Order",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🧾</Text>,
        }}
      />
      <Tabs.Screen
        name="request"
        options={{
          title: "Request",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>➕</Text>,
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: "My requests",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📋</Text>,
        }}
      />
    </Tabs>
  );
}
