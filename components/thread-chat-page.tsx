"use client";

import { SyncRuntime } from "@/components/sync-runtime";
import { ThreadChat } from "@/components/thread-chat";

export function ThreadChatPage({ threadId }: { threadId: string }) {
  return (
    <main className="thread-chat-page">
      <SyncRuntime />
      <ThreadChat threadId={threadId} />
    </main>
  );
}
