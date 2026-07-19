"use client";

import {
  PROTO_REGION,
  PROTO_THREAD,
  statusLabel,
  syncRollup,
  type ProtoCapture,
} from "./fixture";

export function ProtoStateDump({
  area,
  variant,
  note,
}: {
  area: string;
  variant: string;
  note: string;
}) {
  const rollup = syncRollup(PROTO_THREAD.captures);
  return (
    <aside className="proto-state" aria-label="Prototype state">
      <strong>PROTOTYPE state</strong>
      <code>
        area={area} variant={variant}
      </code>
      <p>{note}</p>
      <pre>{JSON.stringify({ region: PROTO_REGION, rollup, thread: PROTO_THREAD.title }, null, 2)}</pre>
    </aside>
  );
}

export function FakeMap({ label = "Offline Region" }: { label?: string }) {
  return (
    <div className="proto-fake-map" aria-label={label} role="img">
      <div className="proto-fake-map-grain" />
      <span className="proto-fake-map-place">{PROTO_REGION.name}</span>
      <span className="proto-fake-map-pin" style={{ top: "42%", left: "48%" }}>
        ◆
      </span>
      <span className="proto-fake-map-pin photo" style={{ top: "55%", left: "62%" }}>
        ◇
      </span>
      <span className="proto-fake-map-pin" style={{ top: "35%", left: "58%" }}>
        ◆
      </span>
    </div>
  );
}

export function CaptureRow({ capture }: { capture: ProtoCapture }) {
  return (
    <article className={`proto-capture status-${capture.status}`}>
      <div className="proto-capture-meta">
        <span className="proto-status">{statusLabel(capture.status)}</span>
        <span>#{capture.sequence}</span>
        {capture.hasPhoto ? <span>Photo</span> : null}
      </div>
      <p>{capture.text}</p>
    </article>
  );
}

export function ModeDock() {
  return (
    <div className="proto-dock" role="toolbar" aria-label="Capture mode">
      {["Type", "Audio", "Photo", "Video"].map((mode, index) => (
        <button
          key={mode}
          type="button"
          className={index === 0 ? "active" : undefined}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
