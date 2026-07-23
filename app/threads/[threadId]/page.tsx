import { Suspense } from "react";
import { ThreadsArchive } from "@/components/threads-archive";

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
      <ThreadsArchive selectedThreadId={threadId} />
    </Suspense>
  );
}
