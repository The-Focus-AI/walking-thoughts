import { expect, test } from "@playwright/test";
import { DIALOGUE_ROLE_LABELS, dialogueRoles } from "@/lib/desk/dialogue";

/**
 * Which voice a turn is in depends only on where it falls: everything said
 * before the first report came back was said on the trail, everything after
 * it at the desk. The first report answers the walk; the rest answer the
 * walker.
 */

test("the four voices fall out of the order of the turns", () => {
  expect(
    dialogueRoles([
      "capture",
      "enrichment",
      "capture",
      "enrichment",
      "capture",
    ]),
  ).toEqual(["trail", "enrichment", "desk-you", "desk", "desk-you"]);
});

test("several Captures before any report were all made on the trail", () => {
  expect(dialogueRoles(["capture", "capture", "capture"])).toEqual([
    "trail",
    "trail",
    "trail",
  ]);
});

test("a Thread that has never been answered has no desk voice in it", () => {
  const roles = dialogueRoles(["capture"]);
  expect(roles).toEqual(["trail"]);
  expect(dialogueRoles([])).toEqual([]);
});

test("the roles are named in the walker's own terms", () => {
  expect(DIALOGUE_ROLE_LABELS.trail).toBe("You, on the trail");
  expect(DIALOGUE_ROLE_LABELS["desk-you"]).toBe("You, at the desk");
  expect(DIALOGUE_ROLE_LABELS.enrichment).toBe("Enrichment");
  expect(DIALOGUE_ROLE_LABELS.desk).toBe("Desk");
});
