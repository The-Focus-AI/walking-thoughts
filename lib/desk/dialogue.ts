/**
 * The Thread read as the conversation it already is. Four voices, and which
 * one a turn is depends only on where it falls: everything the walker said
 * before the first report came back was said on the trail; everything after
 * it was said at the desk. The first report answers the walk; every report
 * after that answers the walker.
 */

export type DialogueRole = "trail" | "enrichment" | "desk-you" | "desk";

export const DIALOGUE_ROLE_LABELS: Record<DialogueRole, string> = {
  trail: "You, on the trail",
  enrichment: "Enrichment",
  "desk-you": "You, at the desk",
  desk: "Desk",
};

/**
 * Label each turn in order. Takes only the kinds, because that is all the
 * rule needs, which keeps this testable without a Thread.
 */
export function dialogueRoles(
  kinds: ReadonlyArray<"capture" | "enrichment">,
): DialogueRole[] {
  let answered = false;
  return kinds.map((kind) => {
    if (kind === "capture") return answered ? "desk-you" : "trail";
    const role: DialogueRole = answered ? "desk" : "enrichment";
    answered = true;
    return role;
  });
}
