// Send notifications through the Expo Push API. It's free and needs no SDK —
// just an HTTP POST of up to 100 messages per call. We deliberately swallow
// failures here so a flaky push never breaks the user-facing request flow.

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  // Expo accepts at most 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(chunk),
      });
    } catch (e) {
      console.error("Expo push send failed", e);
    }
  }
}
