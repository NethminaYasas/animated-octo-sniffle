import type { Metadata } from "next";
import { Suspense } from "react";

import { SiteHeader } from "@/components/site-header";

import { ProfileContent } from "./profile-content";

export const metadata: Metadata = {
  title: "Your profile · kaluwo",
};

export default function ProfilePage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <div className="mx-auto w-full max-w-3xl flex-1 px-3 py-6 sm:px-4 sm:py-8">
        <Suspense
          fallback={
            <div
              aria-hidden="true"
              className="h-52 animate-pulse rounded-xl border border-line bg-surface"
            />
          }
        >
          <ProfileContent />
        </Suspense>
      </div>
    </main>
  );
}
