import { SignIn } from "@clerk/nextjs";
import { AppShell } from "@/components/app-shell";
import { authConfiguration } from "@/lib/auth-config";

export default function SignInPage() {
  if (!authConfiguration().configured) {
    return <AppShell configurationRequired />;
  }
  return (
    <main className="auth-page">
      <SignIn />
    </main>
  );
}
