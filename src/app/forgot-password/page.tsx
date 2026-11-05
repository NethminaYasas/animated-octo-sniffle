import type { Metadata } from "next";

import { AuthShell } from "@/components/auth-shell";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password · kaluwo",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="If you joined with Google, we can email you a reset link."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
