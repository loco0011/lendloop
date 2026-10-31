import { ConvexError } from "convex/values";

/**
 * Shows the server's message for errors we raised on purpose. Anything else is
 * unexpected, and its text is not meant for users.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: unknown };
    if (typeof data.message === "string") return data.message;
  }
  return "Something went wrong. Please try again.";
}
