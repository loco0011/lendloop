"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set. See .env.example.");
}
const convex = new ConvexReactClient(convexUrl);

/** Creates the Convex user record as soon as a session exists. */
function UserSync() {
  const { isAuthenticated } = useConvexAuth();
  const ensureCurrent = useMutation(api.users.ensureCurrent);

  useEffect(() => {
    if (isAuthenticated) {
      ensureCurrent().catch((error: unknown) => {
        console.error("Could not set up the user account", error);
      });
    }
  }, [isAuthenticated, ensureCurrent]);

  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <UserSync />
      {children}
    </ConvexProviderWithClerk>
  );
}
