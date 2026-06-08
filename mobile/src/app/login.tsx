import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";

type Mode = "truck" | "admin";

export default function Login() {
  const { loginAdmin, loginTruck } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("truck");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "admin") {
        await loginAdmin(email.trim(), password);
        router.replace("/(admin)/requests");
      } else {
        await loginTruck(username.trim(), password);
        router.replace("/(truck)/order");
      }
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-amber-100">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 items-center justify-center p-4"
      >
        <View className="w-full max-w-sm bg-white border border-stone-300 rounded-3xl p-6 shadow-xl">
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-xl bg-amber-800" />
            <Text className="text-2xl font-bold text-stone-900">Inventory Logger</Text>
          </View>
          <Text className="text-sm text-stone-600 mt-2">
            {mode === "truck" ? "Location sign-in" : "Admin sign-in"}
          </Text>

          {/* Mode toggle */}
          <View className="mt-5 flex-row rounded-xl bg-stone-200 p-1">
            <Pressable
              onPress={() => setMode("truck")}
              className={`flex-1 py-2 rounded-lg ${mode === "truck" ? "bg-white" : ""}`}
            >
              <Text
                className={`text-center font-medium ${
                  mode === "truck" ? "text-stone-900" : "text-stone-600"
                }`}
              >
                Location
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("admin")}
              className={`flex-1 py-2 rounded-lg ${mode === "admin" ? "bg-white" : ""}`}
            >
              <Text
                className={`text-center font-medium ${
                  mode === "admin" ? "text-stone-900" : "text-stone-600"
                }`}
              >
                Admin
              </Text>
            </Pressable>
          </View>

          {/* Fields */}
          <View className="mt-5 gap-3">
            {mode === "admin" ? (
              <TextInput
                placeholder="Email"
                placeholderTextColor="#a8a29e"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                className="w-full rounded-xl border border-stone-300 px-4 py-3 text-stone-900"
              />
            ) : (
              <TextInput
                placeholder="Location username"
                placeholderTextColor="#a8a29e"
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                className="w-full rounded-xl border border-stone-300 px-4 py-3 text-stone-900"
              />
            )}
            <TextInput
              placeholder="Password"
              placeholderTextColor="#a8a29e"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              className="w-full rounded-xl border border-stone-300 px-4 py-3 text-stone-900"
            />

            {error && <Text className="text-sm text-red-700">{error}</Text>}

            <Pressable
              disabled={busy}
              onPress={onSubmit}
              className={`w-full rounded-xl bg-stone-900 py-3 shadow-md ${busy ? "opacity-60" : ""}`}
            >
              {busy ? (
                <ActivityIndicator color="#fffbeb" />
              ) : (
                <Text className="text-center text-amber-50 font-semibold">Sign in</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
