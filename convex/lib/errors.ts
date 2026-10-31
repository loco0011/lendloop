import { ConvexError } from "convex/values";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT";

/**
 * Convex redacts plain `Error` messages in production, so anything the user
 * should read has to be a ConvexError. The code lets callers and tests branch
 * on the failure type without matching on message text.
 */
export function appError(code: ErrorCode, message: string) {
  return new ConvexError({ code, message });
}
