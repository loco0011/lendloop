"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ToolForm } from "@/components/ToolForm";
import { ToolSummary, type ToolView } from "@/components/ToolSummary";
import {
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  ErrorMessage,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { useSubmit } from "@/lib/useSubmit";

function ListingCard({ tool }: { tool: ToolView }) {
  const updateTool = useMutation(api.tools.update);
  const removeTool = useMutation(api.tools.remove);
  const [isEditing, setIsEditing] = useState(false);
  const { isPending, error, submit } = useSubmit();

  if (isEditing) {
    return (
      <Card>
        <ToolForm
          initialValues={{
            name: tool.name,
            category: tool.category,
            condition: tool.condition,
            description: tool.description,
          }}
          submitLabel="Save changes"
          onSubmit={(values) => updateTool({ toolId: tool._id, ...values })}
          onDone={() => setIsEditing(false)}
        />
      </Card>
    );
  }

  return (
    <Card>
      <ToolSummary tool={tool} />
      <ErrorMessage message={error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
        <ConfirmButton
          label="Delete"
          confirmLabel="Confirm delete"
          disabled={isPending}
          onConfirm={() => void submit(() => removeTool({ toolId: tool._id }))}
        />
      </div>
    </Card>
  );
}

export default function ListingsPage() {
  const tools = useQuery(api.tools.listMine);
  const createTool = useMutation(api.tools.create);
  const [isAdding, setIsAdding] = useState(false);

  return (
    <>
      <PageTitle
        title="My listings"
        action={
          !isAdding && (
            <Button onClick={() => setIsAdding(true)}>List a tool</Button>
          )
        }
      />
      {isAdding && (
        <Card>
          <ToolForm
            submitLabel="List tool"
            onSubmit={(values) => createTool(values)}
            onDone={() => setIsAdding(false)}
          />
        </Card>
      )}
      {tools === undefined ? (
        <LoadingState label="Loading your listings…" />
      ) : tools.length === 0 ? (
        !isAdding && (
          <EmptyState
            title="You haven't listed anything yet"
            hint="List a tool you'd be happy to lend to a neighbour."
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <ListingCard key={tool._id} tool={tool} />
          ))}
        </div>
      )}
    </>
  );
}
