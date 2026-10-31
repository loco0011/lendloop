import type { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui";
import type { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/convex/lib/constants";

export type ToolView = FunctionReturnType<typeof api.tools.list>[number];

export function ToolSummary({ tool }: { tool: ToolView }) {
  const isAvailable = tool.availability === "available";
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-medium">{tool.name}</h2>
        <Badge tone={isAvailable ? "success" : "warning"}>
          {isAvailable ? "Available" : "On loan"}
        </Badge>
      </div>
      <p className="text-sm text-zinc-500">
        {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
      </p>
      <p className="text-sm whitespace-pre-line text-zinc-700">
        {tool.description}
      </p>
    </>
  );
}
