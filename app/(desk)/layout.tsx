import { Suspense } from "react";
import { DeskWorkspace } from "@/components/desk-workspace";

/**
 * The desk workspace lives in the layout so it survives navigation between
 * the day list, one day, and one Thread — search, scroll, and the loaded
 * Threads keep their state instead of remounting on every route change.
 */
export default function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<p className="proto-pad">Opening Days…</p>}>
      <DeskWorkspace>{children}</DeskWorkspace>
    </Suspense>
  );
}
