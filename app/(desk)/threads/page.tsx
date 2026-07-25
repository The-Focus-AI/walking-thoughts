import { redirect } from "next/navigation";

/** Threads are reached through the day they were walked. */
export default function ThreadsIndexPage() {
  redirect("/days");
}
