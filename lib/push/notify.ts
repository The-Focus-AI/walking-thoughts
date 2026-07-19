import type {
  PushNotificationEvent,
  PushRepository,
  PushSendPayload,
  PushSender,
} from "./types";

export function notificationEventKey(event: PushNotificationEvent): string {
  if (event.kind === "needs_attention" && event.attempt != null) {
    return `enrichment:${event.jobId}:${event.kind}:a${event.attempt}`;
  }
  return `enrichment:${event.jobId}:${event.kind}`;
}

export function buildPushPayload(event: PushNotificationEvent): PushSendPayload {
  if (event.kind === "complete") {
    const title = event.title?.trim() || "Thread ready";
    return {
      title,
      body: "Enrichment finished for your Thread batch.",
      url: "/",
      tag: notificationEventKey(event),
    };
  }
  return {
    title: "Needs attention",
    body: event.reason?.trim() || "Enrichment needs attention.",
    url: "/",
    tag: notificationEventKey(event),
  };
}

export async function notifyEnrichmentOutcome(
  userId: string,
  event: PushNotificationEvent,
  repository: PushRepository,
  sender: PushSender,
): Promise<"sent" | "suppressed" | "no_subscribers" | "failed"> {
  const claimed = await repository.claimNotificationEvent(
    userId,
    notificationEventKey(event),
  );
  if (!claimed) return "suppressed";

  const subscriptions = await repository.listSubscriptions(userId);
  if (subscriptions.length === 0) return "no_subscribers";

  const payload = buildPushPayload(event);
  let anySent = false;
  let anyFailed = false;
  for (const subscription of subscriptions) {
    const result = await sender.send(subscription, payload);
    if (result === "gone") {
      await repository.deleteSubscription(userId, subscription.endpoint);
      continue;
    }
    if (result === "sent") anySent = true;
    if (result === "failed") anyFailed = true;
  }

  if (anySent) return "sent";
  if (anyFailed) return "failed";
  return "no_subscribers";
}
