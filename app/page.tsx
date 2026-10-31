"use client";

import { SignInButton } from "@clerk/nextjs";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, EmptyState, LoadingState } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/convex/lib/constants";

function PublicToolList() {
  const tools = useQuery(api.tools.listPublic);

  if (tools === undefined) return <LoadingState label="Loading tools…" />;
  if (tools.length === 0) {
    return (
      <EmptyState
        title="No tools are available right now"
        hint="Check back soon, or sign in and list one of your own."
      />
    );
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
      {tools.map((tool, index) => (
        // The public query returns no ids by design, so the index is the key.
        <li key={index} className="flex justify-between gap-4 px-4 py-3">
          <span className="font-medium">{tool.name}</span>
          <span className="text-sm text-zinc-500">
            {CATEGORY_LABELS[tool.category]}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RedirectToApp() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/tools");
  }, [router]);
  return <LoadingState />;
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">LendLoop</h1>
        <p className="mt-1 text-zinc-600">
          Borrow what you need. Lend what you don&apos;t.
        </p>
      </header>

      <AuthLoading>
        <LoadingState />
      </AuthLoading>
      <Authenticated>
        <RedirectToApp />
      </Authenticated>
      <Unauthenticated>
        <SignInButton mode="modal">
          <Button className="w-fit">Sign in to lend or borrow</Button>
        </SignInButton>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Available tools</h2>
          <PublicToolList />
        </section>
      </Unauthenticated>
    </main>
  );
}
