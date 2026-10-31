"use client";

import { useState, type FormEvent } from "react";
import { Button, ErrorMessage, Field, inputClass } from "@/components/ui";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  TOOL_DESCRIPTION_MAX_LENGTH,
  TOOL_NAME_MAX_LENGTH,
  type ToolCategory,
  type ToolCondition,
} from "@/convex/lib/constants";
import { useSubmit } from "@/lib/useSubmit";

export type ToolFormValues = {
  name: string;
  category: ToolCategory;
  condition: ToolCondition;
  description: string;
};

const EMPTY_TOOL: ToolFormValues = {
  name: "",
  category: "power_tools",
  condition: "good",
  description: "",
};

export function ToolForm({
  initialValues = EMPTY_TOOL,
  submitLabel,
  onSubmit,
  onDone,
}: {
  initialValues?: ToolFormValues;
  submitLabel: string;
  onSubmit: (values: ToolFormValues) => Promise<unknown>;
  /** Called after a successful save, and when the user cancels. */
  onDone: () => void;
}) {
  const [values, setValues] = useState(initialValues);
  const { isPending, error, submit } = useSubmit();

  function setField<K extends keyof ToolFormValues>(
    field: K,
    value: ToolFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await submit(() => onSubmit(values))) onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label="Name">
        <input
          className={inputClass}
          value={values.name}
          maxLength={TOOL_NAME_MAX_LENGTH}
          required
          onChange={(event) => setField("name", event.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <select
            className={inputClass}
            value={values.category}
            onChange={(event) =>
              setField("category", event.target.value as ToolCategory)
            }
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition">
          <select
            className={inputClass}
            value={values.condition}
            onChange={(event) =>
              setField("condition", event.target.value as ToolCondition)
            }
          >
            {Object.entries(CONDITION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label={`Description (${values.description.length}/${TOOL_DESCRIPTION_MAX_LENGTH})`}
      >
        <textarea
          className={inputClass}
          rows={3}
          value={values.description}
          maxLength={TOOL_DESCRIPTION_MAX_LENGTH}
          required
          onChange={(event) => setField("description", event.target.value)}
        />
      </Field>
      <ErrorMessage message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
