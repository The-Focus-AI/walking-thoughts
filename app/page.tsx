import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { decideAccess } from "@/lib/access";

export default async function HomePage() {
  const access = await decideAccess();

  if (access.status === "configuration_required") {
    return <AppShell configurationRequired />;
  }
  if (access.status === "signed_out") redirect("/sign-in");
  if (access.status === "forbidden") {
    return (
      <main className="access-denied">
        <p className="eyebrow">Walking Thoughts</p>
        <h1>This account is not allowed.</h1>
        <p>Sign out and use the identity configured for this private app.</p>
        <UserButton />
      </main>
    );
  }

  return <AppShell account={<UserButton />} />;
}
