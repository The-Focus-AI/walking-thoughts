import { Suspense } from "react";
import { JournalNotebook } from "@/components/journal-notebook";

export const metadata = {
  title: "Notebook — Walking Thoughts",
};

export default function NotebookPage() {
  return (
    <Suspense>
      <JournalNotebook />
    </Suspense>
  );
}
