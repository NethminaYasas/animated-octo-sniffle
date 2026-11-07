import { notFound } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-user";

export const instant = false;

export default async function ModmailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getServerSession();

  if (!user) {
    return notFound();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-4">
      {children}
    </div>
  );
}
