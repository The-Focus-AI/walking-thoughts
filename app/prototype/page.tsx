import { redirect } from "next/navigation";

/**
 * PROTOTYPE entry — Preview links often hit /prototype.
 * Forward to the trail-cleanup switcher, preserving ?area=&variant=.
 */
export default async function PrototypeIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  if (!query.has("area")) query.set("area", "density");
  if (!query.has("variant")) query.set("variant", "A");

  redirect(`/prototype/trail-cleanup?${query.toString()}`);
}
