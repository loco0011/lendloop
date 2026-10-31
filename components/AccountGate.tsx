"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/lib/errorMessage";

/**
 * Creates the Convex user record, then renders the app. Signed-in pages call
 * queries that require that record, so they must not render before it exists.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  const ensureCurrent = useMutation(api.users.ensureCurrent);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    ensureCurrent().catch((caught: unknown) => {
      setError(getErrorMessage(caught));
    });
  }, [ensureCurrent, attempt]);

  if (me) return <>{children}</>;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <ErrorMessage message={error} />
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            setAttempt((current) => current + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  return <LoadingState label="Setting up your account…" />;
}
