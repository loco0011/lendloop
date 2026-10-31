"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { ToolSummary, type ToolView } from "@/components/ToolSummary";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  ErrorMessage,
  Field,
  inputClass,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS, type ToolCategory } from "@/convex/lib/constants";
import { todayUtc } from "@/convex/lib/dates";
import { useSubmit } from "@/lib/useSubmit";

function RequestForm({
  tool,
  onSent,
  onCancel,
}: {
  tool: ToolView;
  onSent: () => void;
  onCancel: () => void;
}) {
  const requestLoan = useMutation(api.loans.request);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { isPending, error, submit } = useSubmit();
  const today = todayUtc();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const succeeded = await submit(() =>
      requestLoan({ toolId: tool._id, startDate, endDate }),
    );
    if (succeeded) onSent();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From">
          <input
            type="date"
            className={inputClass}
            min={today}
            value={startDate}
            required
            onChange={(event) => setStartDate(event.target.value)}
          />
        </Field>
        <Field label="Until">
          <input
            type="date"
            className={inputClass}
            min={startDate || today}
            value={endDate}
            required
            onChange={(event) => setEndDate(event.target.value)}
          />
        </Field>
      </div>
      <ErrorMessage message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Send request"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ToolCard({ tool, isAdmin }: { tool: ToolView; isAdmin: boolean }) {
  const removeListing = useMutation(api.admin.removeListing);
  const [isRequesting, setIsRequesting] = useState(false);
  const [wasRequested, setWasRequested] = useState(false);
  const { isPending, error, submit } = useSubmit();

  return (
    <Card>
      <ToolSummary tool={tool} />
      <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
        {tool.isMine ? "Your listing" : `Lent by ${tool.ownerFirstName}`}
        {tool.ownerIsTrusted && <Badge tone="info">Trusted Lender</Badge>}
      </p>

      {wasRequested && !isRequesting && (
        <p role="status" className="text-sm text-green-700">
          Request sent. Track it under My requests.
        </p>
      )}
      <ErrorMessage message={error} />

      {isRequesting ? (
        <RequestForm
          tool={tool}
          onSent={() => {
            setIsRequesting(false);
            setWasRequested(true);
          }}
          onCancel={() => setIsRequesting(false)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {!tool.isMine && (
            <Button onClick={() => setIsRequesting(true)}>
              Request to borrow
            </Button>
          )}
          {isAdmin && (
            <ConfirmButton
              label="Remove listing"
              confirmLabel="Confirm removal"
              disabled={isPending}
              onConfirm={() =>
                void submit(() => removeListing({ toolId: tool._id }))
              }
            />
          )}
        </div>
      )}
    </Card>
  );
}

export default function ToolsPage() {
  const [category, setCategory] = useState<ToolCategory | undefined>();
  const tools = useQuery(api.tools.list, { category });
  const me = useQuery(api.users.me);

  return (
    <>
      <PageTitle
        title="All tools"
        action={
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            Category
            <select
              className={`${inputClass} w-auto`}
              value={category ?? ""}
              onChange={(event) =>
                setCategory(
                  (event.target.value as ToolCategory) || undefined,
                )
              }
            >
              <option value="">All</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {tools === undefined ? (
        <LoadingState label="Loading tools…" />
      ) : tools.length === 0 ? (
        <EmptyState
          title={
            category
              ? `No ${CATEGORY_LABELS[category].toLowerCase()} tools listed`
              : "No tools listed yet"
          }
          hint={
            category
              ? "Try another category."
              : "Add the first one under My listings."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <ToolCard
              key={tool._id}
              tool={tool}
              isAdmin={me?.role === "admin"}
            />
          ))}
        </div>
      )}
    </>
  );
}
