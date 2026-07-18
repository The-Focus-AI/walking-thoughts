"use client";

export type CaptureMode = "type" | "audio" | "photo" | "video";

const MODES: Array<{ id: CaptureMode; label: string }> = [
  { id: "type", label: "Type" },
  { id: "audio", label: "Audio" },
  { id: "photo", label: "Photo" },
  { id: "video", label: "Video" },
];

export function OutdoorCaptureDock({
  mode,
  onChange,
  disabled,
}: {
  mode: CaptureMode;
  onChange: (mode: CaptureMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="outdoor-dock" role="toolbar" aria-label="Capture mode">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          className={mode === item.id ? "outdoor-dock-btn active" : "outdoor-dock-btn"}
          aria-pressed={mode === item.id}
          disabled={disabled}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
