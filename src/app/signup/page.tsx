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
      subtitle="Use Google, or join with a single-use invite code and a username and password."
    >
      <SignupForm />
    </AuthShell>
  );
}
