"use client";

import { Button, ErrorMessage } from "@/components/ui";
import { getErrorMessage } from "@/lib/errorMessage";

/** Catches queries that throw, such as when a session expires mid-page. */
export default function Error({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <ErrorMessage message={getErrorMessage(error)} />
      <Button variant="secondary" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
