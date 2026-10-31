/// <reference types="vite/client" />
import type { ConvexError } from "convex/values";
import { expect } from "vitest";
import type { ErrorCode } from "./lib/errors";

/** Every Convex module, handed to convexTest so it can resolve functions. */
export const modules = import.meta.glob("./**/*.ts");

/** Asserts a call failed for the expected reason, not just that it threw. */
export async function expectAppError(
  call: Promise<unknown>,
  code: ErrorCode,
): Promise<void> {
  await expect(call).rejects.toSatisfy((error: ConvexError<{ code: string }>) => {
    return error.data?.code === code;
  });
}
