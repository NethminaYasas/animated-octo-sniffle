"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { acknowledgeWarning } from "@/lib/moderation/actions";

export function AcknowledgeWarningButton({
  warningId,
}: {
  warningId: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const acknowledge = async () => {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      const result = await acknowledgeWarning(warningId);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Warning acknowledged");
      router.refresh();
    } catch {
      toast.error("Could not acknowledge that warning.");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void acknowledge()}
      className="rounded-full border border-amber-300 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950/40"
    >
      {pending ? "Saving…" : "Acknowledge"}
    </button>
  );
}
