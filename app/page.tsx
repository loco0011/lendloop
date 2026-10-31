"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/convex/lib/constants";

function PublicToolList() {
  const tools = useQuery(api.tools.listPublic);

  if (tools === undefined) {
    return <p className="text-sm text-zinc-500">Loading tools…</p>;
  }
  if (tools.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No tools are available right now. Check back soon.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
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

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">LendLoop</h1>
          <p className="mt-1 text-zinc-600">
            Borrow what you need. Lend what you don&apos;t.
          </p>
        </div>
        <Authenticated>
          <UserButton />
        </Authenticated>
      </header>

      <AuthLoading>
        <p className="text-sm text-zinc-500">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <SignInButton mode="modal">
          <button
            type="button"
            className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Sign in to lend or borrow
          </button>
        </SignInButton>
      </Unauthenticated>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Available tools</h2>
        <PublicToolList />
      </section>
    </main>
  );
}
