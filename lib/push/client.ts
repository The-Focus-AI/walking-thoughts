import {
  hasOfferedPushOptIn,
  markPushOptInOffered,
  readNotificationPermission,
  decidePushOptInOffer,
  type NotificationPermissionState,
} from "./opt-in";

type PushClientGlobals = typeof globalThis & {
  __WT_PUSH_CLIENT__?: PushClient;
};

export type PushClient = {
  getPermission(): NotificationPermissionState;
  requestPermission(): Promise<NotificationPermission>;
  subscribe(vapidPublicKey: string): Promise<{
    endpoint: string;
    p256dh: string;
    auth: string;
  } | null>;
  registerSubscription(body: {
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<boolean>;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function defaultPushClient(): PushClient {
  return {
    getPermission() {
      return readNotificationPermission();
    },
    async requestPermission() {
      if (typeof Notification === "undefined") return "denied";
      return Notification.requestPermission();
    },
    async subscribe(vapidPublicKey) {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return null;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            vapidPublicKey,
          ) as BufferSource,
        }));
      const json = subscription.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!json.endpoint || !p256dh || !auth) return null;
      return { endpoint: json.endpoint, p256dh, auth };
    },
    async registerSubscription(body) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
      if (testUser) {
        headers["x-walking-thoughts-test-user"] = testUser;
      }
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return response.ok;
    },
  };
}

export function getPushClient(): PushClient {
  return (
    (globalThis as PushClientGlobals).__WT_PUSH_CLIENT__ ?? defaultPushClient()
  );
}

export type AfterSyncPushOptInResult =
  | { status: "idle" }
  | { status: "offer" }
  | { status: "subscribed" }
  | { status: "denied" }
  | { status: "unavailable"; reason: string };

/**
 * After a successful sync batch, decide whether to surface the opt-in UI.
 * Does not request permission until the user confirms (enableNotifications).
 */
export function evaluatePushOptInAfterSync(input: {
  successfulSyncResultCount: number;
  storage?: Pick<Storage, "getItem" | "setItem">;
  client?: PushClient;
}): AfterSyncPushOptInResult {
  const client = input.client ?? getPushClient();
  const storage = input.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  const decision = decidePushOptInOffer({
    successfulSyncResultCount: input.successfulSyncResultCount,
    alreadyOffered: hasOfferedPushOptIn(storage),
    permission: client.getPermission(),
  });
  if (decision === "skip_unsupported") {
    return { status: "unavailable", reason: "Notifications are unavailable here" };
  }
  if (decision === "skip_already_decided") {
    const permission = client.getPermission();
    if (permission === "granted") return { status: "subscribed" };
    if (permission === "denied") return { status: "denied" };
    return { status: "idle" };
  }
  if (decision !== "offer") return { status: "idle" };
  markPushOptInOffered(storage);
  return { status: "offer" };
}

export async function enablePushNotifications(input: {
  vapidPublicKey: string;
  client?: PushClient;
}): Promise<AfterSyncPushOptInResult> {
  const client = input.client ?? getPushClient();
  if (!input.vapidPublicKey) {
    return { status: "unavailable", reason: "Push is not configured" };
  }
  const permission = await client.requestPermission();
  if (permission === "denied") return { status: "denied" };
  if (permission !== "granted") {
    return { status: "unavailable", reason: "Notification permission was not granted" };
  }
  const subscription = await client.subscribe(input.vapidPublicKey);
  if (!subscription) {
    return { status: "unavailable", reason: "Could not create a push subscription" };
  }
  const registered = await client.registerSubscription(subscription);
  if (!registered) {
    return { status: "unavailable", reason: "Could not store the push subscription" };
  }
  return { status: "subscribed" };
}
