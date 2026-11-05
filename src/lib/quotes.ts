"use client";

import { useMemo, useSyncExternalStore } from "react";

export type Quote = {
  id: string;
  author: string;
  text: string;
  sourceType: "post" | "comment";
  sourceId: number;
  threadId: number;
};

const QUOTES_KEY = "kaluwo:quote-clipboard";
const QUOTES_EVENT = "kaluwo:quotes-changed";
const MAX_QUOTES = 20;
const MAX_QUOTE_TEXT = 2_000;

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRaw(): string {
  try {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(QUOTES_KEY) ?? "";
  } catch {
    return "";
  }
}

function isQuote(value: unknown): value is Quote {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const quote = value as Record<string, unknown>;

  return (
    typeof quote.id === "string" &&
    typeof quote.author === "string" &&
    typeof quote.text === "string" &&
    (quote.sourceType === "post" || quote.sourceType === "comment") &&
    typeof quote.sourceId === "number" &&
    typeof quote.threadId === "number"
  );
}

function parseQuotes(raw: string): Quote[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return Array.isArray(parsed) ? parsed.filter(isQuote) : [];
  } catch {
    return [];
  }
}

function writeQuotes(quotes: Quote[]): boolean {
  try {
    window.localStorage.setItem(QUOTES_KEY, JSON.stringify(quotes));
    window.dispatchEvent(new Event(QUOTES_EVENT));
    return true;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === QUOTES_KEY) {
      onChange();
    }
  };

  window.addEventListener(QUOTES_EVENT, onChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(QUOTES_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useQuotes(): Quote[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");

  return useMemo(() => parseQuotes(raw), [raw]);
}

/**
 * Adds a quote to the clipboard. Quoting the exact same text twice is a no-op
 * so pressing Reply twice does not create duplicates.
 */
export function addQuote(input: Omit<Quote, "id">): Quote | null {
  const text = input.text.replace(/\s+/g, " ").trim();

  if (!text) {
    return null;
  }

  const quotes = parseQuotes(readRaw());
  const existing = quotes.find(
    (quote) =>
      quote.sourceType === input.sourceType &&
      quote.sourceId === input.sourceId &&
      quote.text === text,
  );

  if (existing) {
    return existing;
  }

  const quote: Quote = {
    ...input,
    id: createId(),
    text: text.slice(0, MAX_QUOTE_TEXT),
  };

  const next = [...quotes, quote].slice(-MAX_QUOTES);

  return writeQuotes(next) ? quote : null;
}

export function removeQuote(id: string): boolean {
  return writeQuotes(parseQuotes(readRaw()).filter((quote) => quote.id !== id));
}

export function clearQuotes(): boolean {
  return writeQuotes([]);
}
