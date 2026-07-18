import { SignUp } from "@clerk/nextjs";
import { AppShell } from "@/components/app-shell";
import { authConfiguration } from "@/lib/auth-config";

export default function SignUpPage() {
  if (!authConfiguration().clerkReady) {
    return <AppShell configurationRequired />;
  }
  return (
    <main className="auth-page">
      <SignUp signInUrl="/sign-in" />
    </main>
  );
}
