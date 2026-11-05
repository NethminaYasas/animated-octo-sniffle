import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth-shell";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in · kaluwo",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Log in"
      subtitle="Use Google, or the username and password you chose when you joined."
    >
      <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
