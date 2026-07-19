import { neon } from "@neondatabase/serverless";
import type { PushRepository } from "./types";

export function createNeonPushRepository(databaseUrl: string): PushRepository {
  const sql = neon(databaseUrl);
  let ready: Promise<void> | null = null;
  const ensure = () => {
    ready ??= (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          user_id TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (user_id, endpoint)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS push_notification_events (
          user_id TEXT NOT NULL,
          event_key TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, event_key)
        )
      `;
    })();
    return ready;
  };

  return {
    async upsertSubscription(userId, subscription) {
      await ensure();
      const createdAt = subscription.createdAt ?? new Date().toISOString();
      await sql`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
        VALUES (
          ${userId},
          ${subscription.endpoint},
          ${subscription.p256dh},
          ${subscription.auth},
          ${createdAt}
        )
        ON CONFLICT (user_id, endpoint) DO UPDATE SET
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth
      `;
      const rows = (await sql`
        SELECT endpoint, p256dh, auth, created_at
        FROM push_subscriptions
        WHERE user_id = ${userId} AND endpoint = ${subscription.endpoint}
        LIMIT 1
      `) as Array<{
        endpoint: string;
        p256dh: string;
        auth: string;
        created_at: string;
      }>;
      const row = rows[0];
      if (!row) throw new Error("push_subscription_missing");
      return {
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        createdAt:
          typeof row.created_at === "string"
            ? row.created_at
            : new Date(row.created_at).toISOString(),
      };
    },

    async listSubscriptions(userId) {
      await ensure();
      const rows = (await sql`
        SELECT endpoint, p256dh, auth, created_at
        FROM push_subscriptions
        WHERE user_id = ${userId}
      `) as Array<{
        endpoint: string;
        p256dh: string;
        auth: string;
        created_at: string;
      }>;
      return rows.map((row) => ({
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        createdAt:
          typeof row.created_at === "string"
            ? row.created_at
            : new Date(row.created_at).toISOString(),
      }));
    },

    async deleteSubscription(userId, endpoint) {
      await ensure();
      await sql`
        DELETE FROM push_subscriptions
        WHERE user_id = ${userId} AND endpoint = ${endpoint}
      `;
    },

    async claimNotificationEvent(userId, eventKey) {
      await ensure();
      const rows = (await sql`
        INSERT INTO push_notification_events (user_id, event_key)
        VALUES (${userId}, ${eventKey})
        ON CONFLICT (user_id, event_key) DO NOTHING
        RETURNING event_key
      `) as Array<{ event_key: string }>;
      return rows.length > 0;
    },
  };
}
