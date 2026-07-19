import webpush from "web-push";
import type { PushSendPayload, PushSender, PushSubscriptionRecord } from "./types";

export function createWebPushSender(
  environment: NodeJS.ProcessEnv = process.env,
): PushSender | null {
  const publicKey =
    environment.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? environment.VAPID_PUBLIC_KEY;
  const privateKey = environment.VAPID_PRIVATE_KEY;
  const subject = environment.VAPID_SUBJECT ?? "mailto:wschenk@thefocus.ai";
  if (!publicKey || !privateKey) return null;

  webpush.setVapidDetails(subject, publicKey, privateKey);

  return {
    async send(subscription: PushSubscriptionRecord, payload: PushSendPayload) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload),
        );
        return "sent";
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : undefined;
        if (statusCode === 404 || statusCode === 410) return "gone";
        return "failed";
      }
    },
  };
}

export function createRecordingPushSender(
  sent: Array<{ endpoint: string; payload: PushSendPayload }> = [],
  options: { goneEndpoints?: Set<string> } = {},
): PushSender {
  return {
    async send(subscription, payload) {
      if (options.goneEndpoints?.has(subscription.endpoint)) return "gone";
      sent.push({ endpoint: subscription.endpoint, payload });
      return "sent";
    },
  };
}
