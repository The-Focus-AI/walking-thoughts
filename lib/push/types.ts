export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
};

export type PushNotificationKind = "complete" | "needs_attention";

export type PushNotificationEvent = {
  kind: PushNotificationKind;
  jobId: string;
  threadId: string;
  /** Distinguishes a fresh needs-attention entry after retry from the prior failure. */
  attempt?: number;
  title?: string;
  reason?: string;
};

export type PushSendPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export type PushSender = {
  send(
    subscription: PushSubscriptionRecord,
    payload: PushSendPayload,
  ): Promise<"sent" | "gone" | "failed">;
};

export type PushRepository = {
  upsertSubscription(
    userId: string,
    subscription: Omit<PushSubscriptionRecord, "createdAt"> & {
      createdAt?: string;
    },
  ): Promise<PushSubscriptionRecord>;
  listSubscriptions(userId: string): Promise<PushSubscriptionRecord[]>;
  deleteSubscription(userId: string, endpoint: string): Promise<void>;
  /** Returns true when this event key was newly recorded (should notify). */
  claimNotificationEvent(userId: string, eventKey: string): Promise<boolean>;
};
