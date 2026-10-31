import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  ADMIN_EMAIL,
  expectAppError,
  identityFor,
  insertLoan,
  setup,
  signIn,
  signInAdmin,
  validTool,
  type TestConvex,
} from "./test.setup";

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL);
  // Holds back scheduled notifications: this file tests authorization only.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("signed-out callers", () => {
  it("cannot create a tool", async () => {
    const t = setup();
    await expectAppError(
      t.mutation(api.tools.create, validTool),
      "UNAUTHENTICATED",
    );
  });

  it("cannot create a user record", async () => {
    const t = setup();
    await expectAppError(
      t.mutation(api.users.ensureCurrent, {}),
      "UNAUTHENTICATED",
    );
  });

  it("see only name and category on the public list", async () => {
    const t = setup();
    const { asUser } = await signIn(t, "alice");
    await asUser.mutation(api.tools.create, validTool);

    const publicTools = await t.query(api.tools.listPublic, {});

    expect(publicTools).toEqual([
      { name: validTool.name, category: validTool.category },
    ]);
  });
});

describe("tool ownership", () => {
  it("lets the owner edit and delete their tool", async () => {
    const t = setup();
    const { asUser } = await signIn(t, "alice");
    const toolId = await asUser.mutation(api.tools.create, validTool);

    await asUser.mutation(api.tools.update, {
      toolId,
      ...validTool,
      name: "Hammer drill",
    });
    expect((await t.run((ctx) => ctx.db.get("tools", toolId)))?.name).toBe(
      "Hammer drill",
    );

    await asUser.mutation(api.tools.remove, { toolId });
    expect((await t.run((ctx) => ctx.db.get("tools", toolId)))?.isActive).toBe(
      false,
    );
  });

  it("stops a user editing another user's tool", async () => {
    const t = setup();
    const { asUser: alice } = await signIn(t, "alice");
    const { asUser: bob } = await signIn(t, "bob");
    const toolId = await alice.mutation(api.tools.create, validTool);

    await expectAppError(
      bob.mutation(api.tools.update, { toolId, ...validTool, name: "Mine now" }),
      "FORBIDDEN",
    );
    expect((await t.run((ctx) => ctx.db.get("tools", toolId)))?.name).toBe(
      validTool.name,
    );
  });

  it("stops a user deleting another user's tool", async () => {
    const t = setup();
    const { asUser: alice } = await signIn(t, "alice");
    const { asUser: bob } = await signIn(t, "bob");
    const toolId = await alice.mutation(api.tools.create, validTool);

    await expectAppError(
      bob.mutation(api.tools.remove, { toolId }),
      "FORBIDDEN",
    );
    expect((await t.run((ctx) => ctx.db.get("tools", toolId)))?.isActive).toBe(
      true,
    );
  });

  it("assigns the owner from the session", async () => {
    const t = setup();
    const { asUser, userId } = await signIn(t, "alice");
    const toolId = await asUser.mutation(api.tools.create, validTool);
    expect((await t.run((ctx) => ctx.db.get("tools", toolId)))?.ownerId).toBe(
      userId,
    );
  });

  it("trims text and rejects over-long or blank values", async () => {
    const t = setup();
    const { asUser } = await signIn(t, "alice");

    const toolId = await asUser.mutation(api.tools.create, {
      ...validTool,
      name: "  Drill  ",
    });
    expect((await t.run((ctx) => ctx.db.get("tools", toolId)))?.name).toBe(
      "Drill",
    );

    await expectAppError(
      asUser.mutation(api.tools.create, { ...validTool, name: "   " }),
      "INVALID_INPUT",
    );
    await expectAppError(
      asUser.mutation(api.tools.create, {
        ...validTool,
        description: "x".repeat(501),
      }),
      "INVALID_INPUT",
    );
  });
});

describe("approving requests", () => {
  async function toolWithPendingRequest(t: TestConvex) {
    const alice = await signIn(t, "alice");
    const bob = await signIn(t, "bob");
    const toolId = await alice.asUser.mutation(api.tools.create, validTool);
    const loanId = await insertLoan(t, toolId, alice.userId, bob.userId);
    return { alice, bob, toolId, loanId };
  }

  it("lets the tool owner approve", async () => {
    const t = setup();
    const { alice, loanId } = await toolWithPendingRequest(t);

    await alice.asUser.mutation(api.loans.approve, { loanId });

    expect((await t.run((ctx) => ctx.db.get("loans", loanId)))?.status).toBe(
      "approved",
    );
  });

  it("stops an unrelated user approving", async () => {
    const t = setup();
    const { loanId } = await toolWithPendingRequest(t);
    const { asUser: mallory } = await signIn(t, "mallory");

    await expectAppError(
      mallory.mutation(api.loans.approve, { loanId }),
      "FORBIDDEN",
    );
    expect((await t.run((ctx) => ctx.db.get("loans", loanId)))?.status).toBe(
      "pending",
    );
  });

  it("stops borrowers approving their own request", async () => {
    const t = setup();
    const { bob, loanId } = await toolWithPendingRequest(t);

    await expectAppError(
      bob.asUser.mutation(api.loans.approve, { loanId }),
      "FORBIDDEN",
    );
  });

  it("rejects approving a loan that is no longer pending", async () => {
    const t = setup();
    const { alice, loanId } = await toolWithPendingRequest(t);
    await alice.asUser.mutation(api.loans.approve, { loanId });

    await expect(
      alice.asUser.mutation(api.loans.approve, { loanId }),
    ).rejects.toThrow("already approved");
  });

  it("rejects approving dates that overlap an approved loan", async () => {
    const t = setup();
    const { alice, bob, toolId, loanId } = await toolWithPendingRequest(t);
    const overlappingLoanId = await insertLoan(
      t,
      toolId,
      alice.userId,
      bob.userId,
      { startDate: "2030-01-05", endDate: "2030-01-09" },
    );

    await alice.asUser.mutation(api.loans.approve, { loanId });

    await expectAppError(
      alice.asUser.mutation(api.loans.approve, { loanId: overlappingLoanId }),
      "CONFLICT",
    );
  });
});

describe("admin functions", () => {
  it("rejects normal users", async () => {
    const t = setup();
    const { asUser: alice, userId: aliceId } = await signIn(t, "alice");
    const { asUser: bob } = await signIn(t, "bob");
    const toolId = await alice.mutation(api.tools.create, validTool);

    await expectAppError(
      bob.mutation(api.admin.removeListing, { toolId }),
      "FORBIDDEN",
    );
    await expectAppError(
      bob.mutation(api.admin.setTrustedLender, {
        userId: aliceId,
        isTrusted: true,
      }),
      "FORBIDDEN",
    );
  });

  it("lets admins remove any listing and declines its pending requests", async () => {
    const t = setup();
    const { asAdmin } = await signInAdmin(t);
    const alice = await signIn(t, "alice");
    const bob = await signIn(t, "bob");
    const toolId = await alice.asUser.mutation(api.tools.create, validTool);
    const loanId = await insertLoan(t, toolId, alice.userId, bob.userId);

    await asAdmin.mutation(api.admin.removeListing, { toolId });

    expect((await t.run((ctx) => ctx.db.get("tools", toolId)))?.isActive).toBe(
      false,
    );
    expect((await t.run((ctx) => ctx.db.get("loans", loanId)))?.status).toBe(
      "declined",
    );
  });

  it("lets admins mark a trusted lender", async () => {
    const t = setup();
    const { asAdmin } = await signInAdmin(t);
    const { userId } = await signIn(t, "alice");

    await asAdmin.mutation(api.admin.setTrustedLender, {
      userId,
      isTrusted: true,
    });

    expect(
      (await t.run((ctx) => ctx.db.get("users", userId)))?.isTrustedLender,
    ).toBe(true);
  });
});

describe("role assignment", () => {
  it("makes verified ADMIN_EMAILS addresses admin on creation", async () => {
    const t = setup();
    const { userId } = await signInAdmin(t);
    expect((await t.run((ctx) => ctx.db.get("users", userId)))?.role).toBe(
      "admin",
    );
  });

  it("does not trust an unverified ADMIN_EMAILS address", async () => {
    const t = setup();
    const impostor = t.withIdentity(
      identityFor("impostor", { email: ADMIN_EMAIL, emailVerified: false }),
    );
    const userId = await impostor.mutation(api.users.ensureCurrent, {});
    expect((await t.run((ctx) => ctx.db.get("users", userId)))?.role).toBe(
      "user",
    );
  });

  it("ignores a role claim in the token", async () => {
    const t = setup();
    const claimant = t.withIdentity(identityFor("eve", { role: "admin" }));
    const userId = await claimant.mutation(api.users.ensureCurrent, {});
    expect((await t.run((ctx) => ctx.db.get("users", userId)))?.role).toBe(
      "user",
    );
  });

  it("creates one record per user and keeps the role on later sign-ins", async () => {
    const t = setup();
    const { asUser, userId } = await signIn(t, "alice");
    await t.mutation(internal.users.promoteToAdmin, {
      email: "alice@example.com",
    });

    expect(await asUser.mutation(api.users.ensureCurrent, {})).toBe(userId);

    expect((await t.run((ctx) => ctx.db.get("users", userId)))?.role).toBe(
      "admin",
    );
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(
      1,
    );
  });
});
