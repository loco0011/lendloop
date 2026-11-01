"use client";

import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { Badge, Card, type BadgeTone } from "@/components/ui";
import type { api } from "@/convex/_generated/api";
import type { LoanStatus } from "@/convex/lib/constants";
import { formatDate, formatTimeAgo } from "@/lib/format";
import { useNow } from "@/lib/useNow";

export type LoanView = FunctionReturnType<typeof api.loans.listMine>[number];

const STATUS_BADGES: Record<LoanStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  returned: { label: "Returned", tone: "info" },
};

function LoanActivity({ activity }: { activity: LoanView["activity"] }) {
  const now = useNow();

  if (activity.length === 0) {
    return <p className="text-xs text-zinc-500">No automation activity yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5 border-t border-zinc-100 pt-2 text-xs">
      {activity.map((item) => (
        <li
          key={item._id}
          className={item.isFailure ? "text-red-700" : "text-zinc-500"}
        >
          {item.label} {formatTimeAgo(item.createdAt, now)}
        </li>
      ))}
    </ul>
  );
}

export function LoanCard({
  loan,
  people,
  children,
}: {
  loan: LoanView;
  /** Who is involved, worded for the viewer, such as "Lent by Sam". */
  people: string;
  /** Action buttons. */
  children?: ReactNode;
}) {
  const badge = STATUS_BADGES[loan.status];
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">{loan.toolName}</h2>
          <p className="text-sm text-zinc-600">{people}</p>
          <p className="text-sm text-zinc-600">
            {formatDate(loan.startDate)} – {formatDate(loan.endDate)}
          </p>
        </div>
        <div className="flex gap-1">
          {loan.isOverdue && <Badge tone="danger">Overdue</Badge>}
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
      </div>
      {children}
      <LoanActivity activity={loan.activity} />
    </Card>
  );
}
