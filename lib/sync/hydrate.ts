import type {
  LocalAttachment,
  LocalCapture,
  LocalThread,
} from "@/lib/local-capture/types";
import type { ServerThread } from "./types";

/** Local Captures that still own outbound work — never overwrite from server. */
function isLocalAuthoritative(status: LocalCapture["status"]): boolean {
  return (
    status === "saved_locally" ||
    status === "syncing" ||
    status === "needs_attention" ||
    status === "enriching"
  );
}

function remoteAttachmentToLocal(
  attachment: ServerThread["captures"][number]["attachments"][number],
): LocalAttachment {
  return {
    id: attachment.id,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
    byteLength: 0,
    localObjectKey: null,
    remoteObjectKey: attachment.id,
    syncStatus: "complete",
  };
}

function remoteCaptureToLocal(
  threadId: string,
  capture: ServerThread["captures"][number],
): LocalCapture {
  return {
    id: capture.id,
    text: capture.text,
    createdAt: capture.createdAt,
    location: capture.location,
    status: "complete",
    threadId,
    sequence: capture.sequence,
    attachments: (capture.attachments ?? []).map(remoteAttachmentToLocal),
    syncReason: null,
    syncRetryable: undefined,
  };
}

export type RemoteThreadMerge = {
  captures: LocalCapture[];
  threads: LocalThread[];
  importedCaptureIds: string[];
};

/**
 * Merge server Threads into local Capture/Thread state.
 * Missing remote Captures are imported as Complete (already synchronized).
 * Existing local Capture *content* is never rewritten, but once a Capture
 * has reached the server, the server owns its Thread placement — a Capture
 * listed under a different remote Thread is rehomed (this is how splits and
 * stale-build groupings converge across devices). Captures still in the
 * outbox keep their local placement until they sync.
 */
export function mergeRemoteThreads(input: {
  localCaptures: LocalCapture[];
  localThreads: LocalThread[];
  remoteThreads: ServerThread[];
}): RemoteThreadMerge {
  const byId = new Map(
    input.localCaptures.map((capture) => [capture.id, capture]),
  );
  let threads = [...input.localThreads];
  const importedCaptureIds: string[] = [];

  for (const remote of input.remoteThreads) {
    let importedIntoThread = 0;

    for (const remoteCapture of remote.captures) {
      const existing = byId.get(remoteCapture.id);
      if (existing) {
        const outbound =
          existing.status === "saved_locally" || existing.status === "syncing";
        if (
          !outbound &&
          (existing.threadId !== remote.id ||
            existing.sequence !== remoteCapture.sequence)
        ) {
          byId.set(remoteCapture.id, {
            ...existing,
            threadId: remote.id,
            sequence: remoteCapture.sequence,
          });
        }
        continue;
      }

      byId.set(
        remoteCapture.id,
        remoteCaptureToLocal(remote.id, remoteCapture),
      );
      importedCaptureIds.push(remoteCapture.id);
      importedIntoThread += 1;
    }

    const prior = threads.find((thread) => thread.id === remote.id);
    const pendingOnThread = [...byId.values()].some(
      (capture) =>
        capture.threadId === remote.id && isLocalAuthoritative(capture.status),
    );

    if (!prior) {
      threads = [
        {
          id: remote.id,
          title: remote.title,
          revision: remote.revision,
          updatedAt: remote.updatedAt,
        },
        ...threads,
      ];
      continue;
    }

    if (importedIntoThread === 0 && remote.revision <= prior.revision) {
      continue;
    }

    threads = threads.map((thread) =>
      thread.id === remote.id
        ? {
            ...thread,
            // Pending local Captures own Thread presentation until they sync.
            title: pendingOnThread ? thread.title : remote.title,
            revision: Math.max(thread.revision, remote.revision),
            updatedAt:
              remote.updatedAt > thread.updatedAt
                ? remote.updatedAt
                : thread.updatedAt,
          }
        : thread,
    );
  }

  return {
    captures: [...byId.values()],
    threads,
    importedCaptureIds,
  };
}
