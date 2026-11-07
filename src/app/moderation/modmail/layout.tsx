import { notFound } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-user";

export const instant = false;

export default async function ModmailStaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getServerSession();

  if (
    !user ||
    user.isBanned ||
    (user.role !== "moderator" && user.role !== "admin")
  ) {
    return notFound();
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4">
      {children}
    </div>
  );
}
