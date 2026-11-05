import type { Metadata } from "next";

import { AuthShell } from "@/components/auth-shell";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password · kaluwo",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something at least 8 characters long."
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
