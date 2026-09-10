import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

export type MycelEnvironment = Record<string, string | undefined>;
export const DEFAULT_MYCEL_BASE_URL = "https://mycel.thefocus.ai/v1";

const catalogSchema = z.object({
  data: z.array(z.object({ id: z.string(), capabilities: z.array(z.string()) })),
});

/** One authenticated caller, never a process-global user or credential cache. */
export function createMycelClient(environment: MycelEnvironment, userId?: string) {
  const key = environment.MYCEL_API_KEY?.trim();
  if (!key) throw new Error("MYCEL_API_KEY_required");
  if (!userId?.trim()) throw new Error("mycel_end_user_required");
  const baseURL = (environment.MYCEL_BASE_URL?.trim() || DEFAULT_MYCEL_BASE_URL).replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${key}`, "X-Mycel-End-User": userId };
  // Cache only for this operation/client lifetime, not across users or jobs.
  let catalog: Promise<z.infer<typeof catalogSchema>["data"]> | undefined;
  async function models() {
    catalog ??= (async () => {
      const response = await fetch(`${baseURL}/models`, { headers, signal: AbortSignal.timeout(20_000), cache: "no-store" });
      if (!response.ok) throw new Error(`mycel_catalog_http_${response.status}`);
      return catalogSchema.parse(await response.json()).data;
    })();
    return catalog;
  }
  async function requireModel(model: string, capabilities: string[]) {
    const selected = (await models()).find((entry) => entry.id === model);
    if (!selected) throw new Error(`mycel_model_unavailable_${model}`);
    const missing = capabilities.filter((capability) => !selected.capabilities.includes(capability));
    if (missing.length) throw new Error(`mycel_capability_unavailable_${model}_${missing.join(",")}`);
  }
  function provider(capabilities: string[]) {
    return createOpenAICompatible({
      name: "mycel", baseURL,
      headers: { ...headers, "X-Exchange-Require-Capability": capabilities.join(",") },
    });
  }
  return { baseURL, headers, models, requireModel, provider };
}
