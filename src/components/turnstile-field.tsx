"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
} from "react";

export type TurnstileFieldHandle = {
  reset: () => void;
};

type TurnstileFieldProps = {
  onTokenChange: (token: string | null) => void;
  onError?: (message: string) => void;
};

/**
 * Cloudflare Turnstile widget. The public site key is safe to ship to the
 * browser. The secret key stays on the server and is used by
 * src/lib/auth/turnstile.ts to verify the token.
 */
export const TurnstileField = forwardRef<
  TurnstileFieldHandle,
  TurnstileFieldProps
>(function TurnstileField({ onTokenChange, onError }, ref) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const widgetRef = useRef<TurnstileInstance | undefined>(undefined);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 380px)");
    const update = () => setCompact(query.matches);

    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenChange(null);
      widgetRef.current?.reset();
    },
  }));

  if (!siteKey) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">CAPTCHA is not configured.</p>
        <p className="mt-1">
          Add <code className="font-mono">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code>{" "}
          to <code className="font-mono">.env.local</code> and restart the dev
          server.
        </p>
      </div>
    );
  }

  const options = {
    theme: "auto",
    size: compact ? "compact" : "flexible",
  } as ComponentProps<typeof Turnstile>["options"] & {
    size: "compact" | "flexible";
  };

  return (
    <div className={compact ? "min-h-[140px]" : "min-h-[65px]"}>
      <Turnstile
        ref={widgetRef}
        siteKey={siteKey}
        options={options}
        onSuccess={(token) => onTokenChange(token)}
        onExpire={() => onTokenChange(null)}
        onError={() => {
          onTokenChange(null);
          onError?.("CAPTCHA could not load. Check your connection and try again.");
        }}
      />
    </div>
  );
});
