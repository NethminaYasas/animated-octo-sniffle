import type { Metadata } from "next";

import { SearchContent } from "./search-content";

export const metadata: Metadata = {
  title: "Search · kaluwo",
};

// The query is request-specific and there is no useful static shell for a
// search page, so let this route block on the incoming searchParams.
export const instant = false;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawQuery = params.q;
  const query = typeof rawQuery === "string" ? rawQuery : "";

  return <SearchContent initialQuery={query} />;
}
