import { Suspense } from "react";
import { ThreadsQueue } from "@/components/threads-queue";

export const metadata = {
  title: "Threads — Walking Thoughts",
};

export default function ThreadsPage() {
  return (
    <Suspense fallback={<p className="proto-pad">Opening Threads…</p>}>
      <ThreadsQueue />
    </Suspense>
  );
}
