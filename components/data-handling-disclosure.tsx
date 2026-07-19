import {
  DATA_HANDLING_BODY,
  DATA_HANDLING_TITLE,
  OFFLINE_CAPTURE_PROMISE,
} from "@/lib/disclosures/copy";

export function DataHandlingDisclosure() {
  return (
    <aside
      className="data-handling"
      aria-label="Data handling"
      data-testid="data-handling-disclosure"
    >
      <h2>{DATA_HANDLING_TITLE}</h2>
      <p>{DATA_HANDLING_BODY}</p>
      <p>{OFFLINE_CAPTURE_PROMISE}</p>
    </aside>
  );
}
