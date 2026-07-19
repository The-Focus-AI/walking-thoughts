import "maplibre-gl/dist/maplibre-gl.css";
import { Suspense } from "react";
import { RegionTracer } from "@/components/region-tracer";

export const metadata = {
  title: "Offline Region tracer — Walking Thoughts",
};

export default function RegionTracerPage() {
  return (
    <Suspense>
      <RegionTracer />
    </Suspense>
  );
}
