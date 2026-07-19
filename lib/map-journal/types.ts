import type { MediaKind, CaptureSyncStatus } from "@/lib/local-capture/types";

export type MappableCapture = {
  id: string;
  threadId: string;
  text: string;
  createdAt: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  status: CaptureSyncStatus;
  mediaKinds: MediaKind[];
};

export type MarkerKind = "text" | MediaKind;

export type JournalMarker = {
  id: string;
  captureId: string;
  threadId: string;
  latitude: number;
  longitude: number;
  kind: MarkerKind;
  clusterCount?: number;
};

export type GpsFix =
  | {
      status: "ready";
      latitude: number;
      longitude: number;
      accuracy: number;
      lowAccuracy: boolean;
    }
  | { status: "unavailable"; reason: string }
  | { status: "pending" };

export type LiveGpsSession = {
  start(): void;
  stop(): void;
  read(): GpsFix;
  subscribe(listener: (fix: GpsFix) => void): () => void;
};
