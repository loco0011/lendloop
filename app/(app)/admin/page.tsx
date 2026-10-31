"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { LoanCard } from "@/components/LoanCard";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { useSubmit } from "@/lib/useSubmit";

type AdminUser = FunctionReturnType<typeof api.admin.listUsers>[number];

function UserRow({ user }: { user: AdminUser }) {
  const setTrustedLender = useMutation(api.admin.setTrustedLender);
  const { isPending, error, submit } = useSubmit();

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {user.firstName}
            {user.role === "admin" && <Badge>Admin</Badge>}
            {user.isTrustedLender && <Badge tone="info">Trusted Lender</Badge>}
          </p>
          <p className="text-sm break-all text-zinc-600">{user.email}</p>
        </div>
        <Button
          variant="secondary"
          disabled={isPending}
          onClick={() =>
            void submit(() =>
              setTrustedLender({
                userId: user._id,
                isTrusted: !user.isTrustedLender,
              }),
            )
          }
        >
          {user.isTrustedLender ? "Remove Trusted badge" : "Mark as Trusted"}
        </Button>
      </div>
      <ErrorMessage message={error} />
    </Card>
  );
}

function AdminPanels() {
  const users = useQuery(api.admin.listUsers);
  const loans = useQuery(api.admin.listLoans);

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Lenders</h2>
        {users === undefined ? (
          <LoadingState label="Loading users…" />
        ) : (
          users.map((user) => <UserRow key={user._id} user={user} />)
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">All loans</h2>
        {loans === undefined ? (
          <LoadingState label="Loading loans…" />
        ) : loans.length === 0 ? (
          <EmptyState title="No loans yet" />
        ) : (
          loans.map((loan) => (
            <LoanCard
              key={loan._id}
              loan={loan}
              people={`${loan.lenderFirstName} to ${loan.borrowerFirstName}`}
            />
          ))
        )}
      </section>
    </>
  );
}

export default function AdminPage() {
  const me = useQuery(api.users.me);

  return (
    <>
      <PageTitle title="Admin" />
      <p className="text-sm text-zinc-600">
        To remove a listing, use the button on its card under All tools.
      </p>
      {me === undefined ? (
        <LoadingState />
      ) : me?.role === "admin" ? (
        <AdminPanels />
      ) : (
        <EmptyState title="Only admins can see this page" />
      )}
    </>
  );
}
