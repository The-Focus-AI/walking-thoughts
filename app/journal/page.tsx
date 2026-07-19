import "maplibre-gl/dist/maplibre-gl.css";
import { Suspense } from "react";
import { MapJournal } from "@/components/map-journal";

export const metadata = {
  title: "Map Journal — Walking Thoughts",
};

export default function JournalPage() {
  return (
    <Suspense>
      <MapJournal />
    </Suspense>
  );
}
