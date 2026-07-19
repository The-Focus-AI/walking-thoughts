import type { LocalCapture, MediaKind } from "@/lib/local-capture/types";

export type MarkerKind = "text" | MediaKind;

export type CaptureMarkerProperties = {
  captureId: string;
  threadId: string | null;
  kind: MarkerKind;
  glyph: string;
  label: string;
};

export type CaptureMarkerFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: CaptureMarkerProperties;
};

export type CaptureMarkerCollection = {
  type: "FeatureCollection";
  features: CaptureMarkerFeature[];
};

const GLYPHS: Record<MarkerKind, string> = {
  text: "T",
  image: "P",
  audio: "A",
  video: "V",
};

/** The dominant medium of a Capture decides its marker treatment. */
export function markerKind(capture: LocalCapture): MarkerKind {
  for (const preferred of ["image", "video", "audio"] as const) {
    if (capture.attachments.some((attachment) => attachment.kind === preferred)) {
      return preferred;
    }
  }
  return "text";
}

export function markerLabel(capture: LocalCapture): string {
  if (capture.text) {
    return capture.text.length > 80
      ? `${capture.text.slice(0, 77)}…`
      : capture.text;
  }
  const named = capture.attachments.map((attachment) => attachment.fileName);
  return named.join(", ") || "Capture";
}

/**
 * Only Captures with a recorded position appear on the map; Captures without
 * location stay honest and are reviewable from their Thread instead.
 */
export function captureMarkers(
  captures: LocalCapture[],
): CaptureMarkerCollection {
  return {
    type: "FeatureCollection",
    features: captures
      .filter(
        (capture): capture is LocalCapture & {
          location: NonNullable<LocalCapture["location"]>;
        } => capture.location !== null,
      )
      .map((capture) => {
        const kind = markerKind(capture);
        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [
              capture.location.longitude,
              capture.location.latitude,
            ] as [number, number],
          },
          properties: {
            captureId: capture.id,
            threadId: capture.threadId,
            kind,
            glyph: GLYPHS[kind],
            label: markerLabel(capture),
          },
        };
      }),
  };
}
