import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/auth";

// Entry gate: send the user to login, the truck tabs, or the admin screen
// depending on auth state.
export default function Index() {
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-amber-50">
        <ActivityIndicator color="#78350f" />
      </View>
    );
  }
  if (!me) return <Redirect href="/login" />;
  if (me.role === "admin") return <Redirect href="/(admin)/requests" />;
  return <Redirect href="/(truck)/order" />;
}
