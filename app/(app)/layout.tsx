"use client";

import { SignInButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import type { ReactNode } from "react";
import { AccountGate } from "@/components/AccountGate";
import { AppNav } from "@/components/AppNav";
import { Button, EmptyState, LoadingState } from "@/components/ui";

const pageClass = "mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <main className={pageClass}>
          <LoadingState />
        </main>
      </AuthLoading>
      <Unauthenticated>
        <main className={`${pageClass} items-center`}>
          <EmptyState title="Please sign in to see this page" />
          <SignInButton mode="modal">
            <Button>Sign in to lend or borrow</Button>
          </SignInButton>
        </main>
      </Unauthenticated>
      <Authenticated>
        <AppNav />
        <main className={pageClass}>
          <AccountGate>{children}</AccountGate>
        </main>
      </Authenticated>
    </>
  );
}
