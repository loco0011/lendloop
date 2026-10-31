"use client";

import { useMutation, useQuery } from "convex/react";
import { LoanCard, type LoanView } from "@/components/LoanCard";
import {
  ConfirmButton,
  EmptyState,
  ErrorMessage,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { useSubmit } from "@/lib/useSubmit";

function MyRequestCard({ loan }: { loan: LoanView }) {
  const cancel = useMutation(api.loans.cancel);
  const { isPending, error, submit } = useSubmit();

  return (
    <LoanCard loan={loan} people={`Lent by ${loan.lenderFirstName}`}>
      <ErrorMessage message={error} />
      {loan.status === "pending" && (
        <div className="flex flex-wrap gap-2">
          <ConfirmButton
            label="Cancel request"
            confirmLabel="Confirm cancel"
            disabled={isPending}
            onConfirm={() => void submit(() => cancel({ loanId: loan._id }))}
          />
        </div>
      )}
    </LoanCard>
  );
}

export default function RequestsPage() {
  const loans = useQuery(api.loans.listMine);

  return (
    <>
      <PageTitle title="My requests" />
      {loans === undefined ? (
        <LoadingState label="Loading your requests…" />
      ) : loans.length === 0 ? (
        <EmptyState
          title="You haven't requested anything yet"
          hint="Find something to borrow under All tools."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {loans.map((loan) => (
            <MyRequestCard key={loan._id} loan={loan} />
          ))}
        </div>
      )}
    </>
  );
}
