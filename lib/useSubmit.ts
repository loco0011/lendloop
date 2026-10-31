"use client";

import { useCallback, useState } from "react";
import { getErrorMessage } from "./errorMessage";

/** Tracks the pending and error state of a mutation for a form or button. */
export function useSubmit() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Resolves to whether the action succeeded; failures land in `error`. */
  const submit = useCallback(async (action: () => Promise<unknown>) => {
    setIsPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(getErrorMessage(caught));
      return false;
    } finally {
      setIsPending(false);
    }
  }, []);

  return { isPending, error, submit };
}
