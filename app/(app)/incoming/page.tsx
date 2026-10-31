"use client";

import { useMutation, useQuery } from "convex/react";
import { LoanCard, type LoanView } from "@/components/LoanCard";
import {
  Button,
  ConfirmButton,
  EmptyState,
  ErrorMessage,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { useSubmit } from "@/lib/useSubmit";

function IncomingCard({ loan }: { loan: LoanView }) {
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);
  const { isPending, error, submit } = useSubmit();
  const loanId = loan._id;

  return (
    <LoanCard loan={loan} people={`Requested by ${loan.borrowerFirstName}`}>
      <ErrorMessage message={error} />
      {loan.status === "pending" && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isPending}
            onClick={() => void submit(() => approve({ loanId }))}
          >
            Approve
          </Button>
          <ConfirmButton
            label="Decline"
            confirmLabel="Confirm decline"
            disabled={isPending}
            onConfirm={() => void submit(() => decline({ loanId }))}
          />
        </div>
      )}
      {loan.status === "approved" && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isPending}
            onClick={() => void submit(() => markReturned({ loanId }))}
          >
            Mark returned
          </Button>
        </div>
      )}
    </LoanCard>
  );
}

export default function IncomingPage() {
  const loans = useQuery(api.loans.listIncoming);

  return (
    <>
      <PageTitle title="Incoming requests" />
      {loans === undefined ? (
        <LoadingState label="Loading requests…" />
      ) : loans.length === 0 ? (
        <EmptyState
          title="No requests yet"
          hint="Requests to borrow your tools will appear here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {loans.map((loan) => (
            <IncomingCard key={loan._id} loan={loan} />
          ))}
        </div>
      )}
    </>
  );
}
