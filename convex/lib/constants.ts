import { v, type Infer } from "convex/values";

/**
 * Domain enums. Declared once as Convex validators so the schema, function
 * args and frontend types can never drift apart.
 */
export const toolCategory = v.union(
  v.literal("power_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);
export type ToolCategory = Infer<typeof toolCategory>;

export const toolCondition = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);
export type ToolCondition = Infer<typeof toolCondition>;

export const loanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);
export type LoanStatus = Infer<typeof loanStatus>;

export const userRole = v.union(v.literal("admin"), v.literal("user"));
export type UserRole = Infer<typeof userRole>;

export const automationEventType = v.union(
  v.literal("request_notification"),
  v.literal("overdue_reminder"),
);
export type AutomationEventType = Infer<typeof automationEventType>;

export const automationEventStatus = v.union(
  v.literal("sent"),
  v.literal("failed"),
);
export type AutomationEventStatus = Infer<typeof automationEventStatus>;

/** Human-readable labels, shared with the UI. */
export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  power_tools: "Power tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

export const CONDITION_LABELS: Record<ToolCondition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};

export const TOOL_NAME_MAX_LENGTH = 80;
export const TOOL_DESCRIPTION_MAX_LENGTH = 500;
