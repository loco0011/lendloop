import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  automationEventStatus,
  automationEventType,
  loanStatus,
  toolCategory,
  toolCondition,
  userRole,
} from "./lib/constants";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    firstName: v.string(),
    role: userRole,
    isTrustedLender: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: toolCategory,
    condition: toolCondition,
    description: v.string(),
    // Deleting a listing sets this to false, so past loans keep their tool.
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_active", ["isActive"])
    .index("by_category", ["category", "isActive"])
    .index("by_owner", ["ownerId", "isActive"]),

  loans: defineTable({
    toolId: v.id("tools"),
    // Copied from the tool so "incoming requests" needs no join.
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD, see lib/dates.ts
    endDate: v.string(),
    status: loanStatus,
    returnedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tool", ["toolId", "status"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    // Finds overdue loans: status == approved and endDate < today.
    .index("by_status_endDate", ["status", "endDate"]),

  automationEvents: defineTable({
    // Optional because a workflow can fail before it reaches any loan, such as
    // the overdue fetch itself. Those failures must still be recorded.
    loanId: v.optional(v.id("loans")),
    type: automationEventType,
    status: automationEventStatus,
    idempotencyKey: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_loan", ["loanId"])
    // Convex has no unique indexes. Writers check this index first, and
    // serializable mutations make that check-then-insert safe.
    .index("by_idempotencyKey", ["idempotencyKey"]),
});
