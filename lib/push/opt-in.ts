export type NotificationPermissionState =
  | NotificationPermission
  | "unsupported";

export type PushOptInDecision =
  | "offer"
  | "skip_already_decided"
  | "skip_no_sync"
  | "skip_unsupported"
  | "skip_already_offered";

/**
 * Permission is offered only after the first successful sync batch that
 * actually synchronized Captures, and only once per device until decided.
 */
export function decidePushOptInOffer(input: {
  successfulSyncResultCount: number;
  alreadyOffered: boolean;
  permission: NotificationPermissionState;
}): PushOptInDecision {
  if (input.permission === "unsupported") return "skip_unsupported";
  if (input.permission === "granted" || input.permission === "denied") {
    return "skip_already_decided";
  }
  if (input.successfulSyncResultCount <= 0) return "skip_no_sync";
  if (input.alreadyOffered) return "skip_already_offered";
  return "offer";
}

export function readNotificationPermission(
  notification: typeof Notification | undefined = globalThis.Notification,
): NotificationPermissionState {
  if (!notification || typeof notification.requestPermission !== "function") {
    return "unsupported";
  }
  return notification.permission;
}

export const PUSH_OPT_IN_OFFERED_KEY = "wt.push.optInOffered";

export function hasOfferedPushOptIn(
  storage: Pick<Storage, "getItem"> | undefined,
): boolean {
  if (!storage) return false;
  return storage.getItem(PUSH_OPT_IN_OFFERED_KEY) === "1";
}

export function markPushOptInOffered(
  storage: Pick<Storage, "setItem"> | undefined,
): void {
  storage?.setItem(PUSH_OPT_IN_OFFERED_KEY, "1");
}
