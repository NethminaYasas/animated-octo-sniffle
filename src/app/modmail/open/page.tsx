import { notFound } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-user";
import { openTicket } from "@/lib/modmail/actions";

export const instant = false;

export default async function OpenTicketPage() {
  const { user } = await getServerSession();

  if (!user) {
    return notFound();
  }

  async function openTicketAction(formData: FormData) {
    const category = formData.get("category") as string;
    const subject = formData.get("subject") as string;
    const message = formData.get("message") as string;

    await openTicket({ category, subject, message });
  }

  return (
    <form action={openTicketAction}>
      <input name="category" type="hidden" value="question" />
      <div className="mx-auto w-full max-w-2xl px-3 py-6 sm:px-4">
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          Open Ticket
        </h1>
        <p className="mt-1 text-sm text-muted">
          Open a ticket to the moderation team.
        </p>

        <div className="mt-6 space-y-3">
          <div className="space-y-2">
            <label htmlFor="modmail-subject" className="block text-xs font-semibold text-muted">
              Subject
            </label>
            <input
              id="modmail-subject"
              name="subject"
              type="text"
              placeholder="Subject"
              required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="modmail-message" className="block text-xs font-semibold text-muted">
              Message
            </label>
            <textarea
              id="modmail-message"
              name="message"
              rows={6}
              placeholder="What would you like to tell the moderation team?"
              required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </div>

          <div className="mt-4">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-full bg-orange-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-800"
            >
              Open Ticket
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}