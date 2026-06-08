import { Stack, Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";

export default function AdminLayout() {
  const { me, loading } = useAuth();
  if (loading) return null;
  if (!me) return <Redirect href="/login" />;
  if (me.role !== "admin") return <Redirect href="/(truck)/order" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
