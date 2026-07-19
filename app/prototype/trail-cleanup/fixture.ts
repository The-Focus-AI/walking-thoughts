/**
 * PROTOTYPE — in-memory fixture for trail-cleanup UI variants.
 * Not wired to Capture store / sync APIs.
 */

export type ProtoStatus =
  | "saved_locally"
  | "syncing"
  | "enriching"
  | "complete"
  | "needs_attention";

export type ProtoCapture = {
  id: string;
  text: string;
  status: ProtoStatus;
  sequence: number;
  createdAt: string;
  hasPhoto?: boolean;
};

export type ProtoThread = {
  title: string;
  revision: number;
  captures: ProtoCapture[];
};

export const PROTO_THREAD: ProtoThread = {
  title: "Today's hike",
  revision: 4,
  captures: [
    {
      id: "c1",
      text: "Ferns along the brook — what species?",
      status: "complete",
      sequence: 1,
      createdAt: "2026-07-19T14:02:00.000Z",
      hasPhoto: true,
    },
    {
      id: "c2",
      text: "Audio note: creek louder after the bend",
      status: "enriching",
      sequence: 2,
      createdAt: "2026-07-19T14:18:00.000Z",
    },
    {
      id: "c3",
      text: "Trail junction unmarked — photo of blazes",
      status: "syncing",
      sequence: 3,
      createdAt: "2026-07-19T14:41:00.000Z",
      hasPhoto: true,
    },
    {
      id: "c4",
      text: "Is this poison ivy or Virginia creeper?",
      status: "saved_locally",
      sequence: 4,
      createdAt: "2026-07-19T15:05:00.000Z",
      hasPhoto: true,
    },
    {
      id: "c5",
      text: "Video of the ridge lookout",
      status: "needs_attention",
      sequence: 5,
      createdAt: "2026-07-19T15:22:00.000Z",
    },
  ],
};

export const PROTO_REGION = {
  name: "Cornwall Bridge",
  radiusKm: 40,
  ready: true,
  version: 3,
};

export function syncRollup(captures: ProtoCapture[]) {
  const counts = {
    saved_locally: 0,
    syncing: 0,
    enriching: 0,
    complete: 0,
    needs_attention: 0,
  };
  for (const capture of captures) counts[capture.status] += 1;
  return counts;
}

export function statusLabel(status: ProtoStatus): string {
  switch (status) {
    case "saved_locally":
      return "Saved locally";
    case "syncing":
      return "Syncing";
    case "enriching":
      return "Enriching";
    case "complete":
      return "Complete";
    case "needs_attention":
      return "Needs attention";
  }
}
