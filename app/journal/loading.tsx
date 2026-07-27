/** Instant feedback for a Map tab tap while the route loads on a slow link. */
export default function JournalLoading() {
  return (
    <p className="route-loading" role="status">
      Opening Map Journal…
    </p>
  );
}
