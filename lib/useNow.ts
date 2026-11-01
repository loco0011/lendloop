"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed each minute so "2 minutes ago" stays accurate. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  return now;
}
