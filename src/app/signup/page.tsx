import type { Metadata } from "next";

import { AuthShell } from "@/components/auth-shell";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up · kaluwo",
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Create an account"
      subtitle="Your email is only used to verify the account and reset your password. You will log in with a username."
    >
      <SignupForm />
    </AuthShell>
  );
}
