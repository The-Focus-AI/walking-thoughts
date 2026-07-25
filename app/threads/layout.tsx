import { Suspense } from "react";
import { ThreadsQueue } from "@/components/threads-queue";

/**
 * The Threads workspace lives in the layout so it survives navigation
 * between the day list, an open Thread, and the day chat — queue pick,
 * day pick, search, and scroll keep their state instead of remounting
 * on every route change.
 */
export default function ThreadsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<p className="proto-pad">Opening Threads…</p>}>
      <ThreadsQueue>{children}</ThreadsQueue>
    </Suspense>
  );
}
