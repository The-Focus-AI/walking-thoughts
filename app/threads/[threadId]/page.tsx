import { Suspense } from "react";
import { ThreadChatPage } from "@/components/thread-chat-page";

export const metadata = {
  title: "Thread — Walking Thoughts",
};

type PageProps = {
  params: Promise<{ threadId: string }>;
};

export default async function ThreadPage({ params }: PageProps) {
  const { threadId } = await params;
  return (
    <Suspense fallback={<p className="proto-pad">Opening Thread…</p>}>
      <ThreadChatPage threadId={threadId} />
    </Suspense>
  );
}
