import { expect, test } from "@playwright/test";
import {
  expectedResourceSeparation,
  fnoxProfileFor,
} from "@/lib/integrations/environments";

test("preview and production map to distinct fnox profiles and resource labels", () => {
  expect(fnoxProfileFor("preview")).toBe("preview");
  expect(fnoxProfileFor("production")).toBe("prod");
  expect(fnoxProfileFor("development")).toBe("default");

  const preview = expectedResourceSeparation("preview");
  const production = expectedResourceSeparation("production");
  expect(preview.neon).not.toBe(production.neon);
  expect(preview.blob).not.toBe(production.blob);
  expect(preview.clerk).not.toBe(production.clerk);
  expect(preview.gateway).not.toBe(production.gateway);
  expect(preview.push).not.toBe(production.push);
  expect(preview.queue).not.toBe(production.queue);
});
