/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { ConvexError } from "convex/values";
import { expect } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { LoanStatus } from "./lib/constants";
import type { ErrorCode } from "./lib/errors";
import schema from "./schema";

/** Every Convex module, handed to convexTest so it can resolve functions. */
const modules = import.meta.glob("./**/*.ts");

export const ADMIN_EMAIL = "admin@example.com";

export const validTool = {
  name: "Cordless drill",
  category: "power_tools",
  condition: "good",
  description: "18V with two batteries",
} as const;

export function setup() {
  return convexTest(schema, modules);
}
export type TestConvex = ReturnType<typeof setup>;

export function identityFor(
  name: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    subject: `clerk_${name}`,
    issuer: "https://test.clerk.accounts.dev",
    email: `${name}@example.com`,
    emailVerified: true,
    givenName: name,
    ...overrides,
  };
}

/** Signs a user in and creates their record, as the client does on load. */
export async function signIn(t: TestConvex, name: string) {
  const asUser = t.withIdentity(identityFor(name));
  const userId = await asUser.mutation(api.users.ensureCurrent, {});
  return { asUser, userId };
}

export async function signInAdmin(t: TestConvex) {
  const asAdmin = t.withIdentity(identityFor("admin", { email: ADMIN_EMAIL }));
  const userId = await asAdmin.mutation(api.users.ensureCurrent, {});
  return { asAdmin, userId };
}

export async function insertLoan(
  t: TestConvex,
  toolId: Id<"tools">,
  lenderId: Id<"users">,
  borrowerId: Id<"users">,
  fields: { startDate?: string; endDate?: string; status?: LoanStatus } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      toolId,
      lenderId,
      borrowerId,
      startDate: "2030-01-01",
      endDate: "2030-01-05",
      status: "pending",
      createdAt: 0,
      updatedAt: 0,
      ...fields,
    }),
  );
}

/** Asserts a call failed for the expected reason, not just that it threw. */
export async function expectAppError(
  call: Promise<unknown>,
  code: ErrorCode,
): Promise<void> {
  await expect(call).rejects.toSatisfy((error: ConvexError<{ code: string }>) => {
    return error.data?.code === code;
  });
}
