"use client";

import { ThreadChat } from "@/components/thread-chat";

export function ThreadChatPage({ threadId }: { threadId: string }) {
  return (
    <main className="thread-chat-page">
      <ThreadChat threadId={threadId} />
    </main>
  );
}
