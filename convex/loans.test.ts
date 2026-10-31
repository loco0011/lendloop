import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { todayUtc, toIsoDate } from "./lib/dates";
import {
  ADMIN_EMAIL,
  expectAppError,
  insertLoan,
  setup,
  signIn,
  signInAdmin,
  validTool,
  type TestConvex,
} from "./test.setup";

const DAY_MS = 24 * 60 * 60 * 1000;
const yesterday = () => toIsoDate(Date.now() - DAY_MS);
const tomorrow = () => toIsoDate(Date.now() + DAY_MS);

async function lenderAndBorrower(t: TestConvex) {
  const lender = await signIn(t, "alice");
  const borrower = await signIn(t, "bob");
  const toolId = await lender.asUser.mutation(api.tools.create, validTool);
  return { lender, borrower, toolId };
}

function loanStatus(t: TestConvex, loanId: Id<"loans">) {
  return t.run(async (ctx) => (await ctx.db.get("loans", loanId))?.status);
}

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL);
  // Holds back scheduled notifications, which automation.test.ts covers.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("requesting a loan", () => {
  const dates = { startDate: "2030-01-01", endDate: "2030-01-05" };

  it("creates a pending loan with parties taken from the tool and session", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await lenderAndBorrower(t);

    const loanId = await borrower.asUser.mutation(api.loans.request, {
      toolId,
      ...dates,
    });

    const loan = await t.run((ctx) => ctx.db.get("loans", loanId));
    expect(loan).toMatchObject({
      status: "pending",
      lenderId: lender.userId,
      borrowerId: borrower.userId,
    });
  });

  it("accepts today as a start date", async () => {
    const t = setup();
    const { borrower, toolId } = await lenderAndBorrower(t);
    await borrower.asUser.mutation(api.loans.request, {
      toolId,
      startDate: todayUtc(),
      endDate: todayUtc(),
    });
  });

  it("rejects a start date in the past", async () => {
    const t = setup();
    const { borrower, toolId } = await lenderAndBorrower(t);
    await expectAppError(
      borrower.asUser.mutation(api.loans.request, {
        toolId,
        startDate: yesterday(),
        endDate: tomorrow(),
      }),
      "INVALID_INPUT",
    );
  });

  it("rejects a start date after the end date", async () => {
    const t = setup();
    const { borrower, toolId } = await lenderAndBorrower(t);
    await expectAppError(
      borrower.asUser.mutation(api.loans.request, {
        toolId,
        startDate: "2030-01-05",
        endDate: "2030-01-01",
      }),
      "INVALID_INPUT",
    );
  });

  it.each(["2030-02-30", "01/02/2030", "not-a-date", ""])(
    "rejects the malformed date %j",
    async (startDate) => {
      const t = setup();
      const { borrower, toolId } = await lenderAndBorrower(t);
      await expectAppError(
        borrower.asUser.mutation(api.loans.request, {
          toolId,
          startDate,
          endDate: "2030-03-01",
        }),
        "INVALID_INPUT",
      );
    },
  );

  it("stops users borrowing their own tool", async () => {
    const t = setup();
    const { lender, toolId } = await lenderAndBorrower(t);
    await expectAppError(
      lender.asUser.mutation(api.loans.request, { toolId, ...dates }),
      "FORBIDDEN",
    );
  });

  it("rejects dates that overlap an approved loan, including shared end days", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await lenderAndBorrower(t);
    await insertLoan(t, toolId, lender.userId, borrower.userId, {
      ...dates,
      status: "approved",
    });

    await expectAppError(
      borrower.asUser.mutation(api.loans.request, {
        toolId,
        startDate: "2030-01-05",
        endDate: "2030-01-08",
      }),
      "CONFLICT",
    );
  });

  it("allows the day after an approved loan ends", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await lenderAndBorrower(t);
    await insertLoan(t, toolId, lender.userId, borrower.userId, {
      ...dates,
      status: "approved",
    });

    await borrower.asUser.mutation(api.loans.request, {
      toolId,
      startDate: "2030-01-06",
      endDate: "2030-01-08",
    });
  });

  it("ignores declined, cancelled and returned loans when checking overlap", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await lenderAndBorrower(t);
    for (const status of ["declined", "cancelled", "returned"] as const) {
      await insertLoan(t, toolId, lender.userId, borrower.userId, {
        ...dates,
        status,
      });
    }

    await borrower.asUser.mutation(api.loans.request, { toolId, ...dates });
  });

  it("rejects a tool that has been deleted", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await lenderAndBorrower(t);
    await lender.asUser.mutation(api.tools.remove, { toolId });
    await expectAppError(
      borrower.asUser.mutation(api.loans.request, { toolId, ...dates }),
      "NOT_FOUND",
    );
  });
});

describe("acting on a loan", () => {
  async function pendingLoan(t: TestConvex) {
    const parties = await lenderAndBorrower(t);
    const loanId = await insertLoan(
      t,
      parties.toolId,
      parties.lender.userId,
      parties.borrower.userId,
    );
    return { ...parties, loanId };
  }

  it("lets the lender decline", async () => {
    const t = setup();
    const { lender, loanId } = await pendingLoan(t);
    await lender.asUser.mutation(api.loans.decline, { loanId });
    expect(await loanStatus(t, loanId)).toBe("declined");
  });

  it("stops the borrower declining", async () => {
    const t = setup();
    const { borrower, loanId } = await pendingLoan(t);
    await expectAppError(
      borrower.asUser.mutation(api.loans.decline, { loanId }),
      "FORBIDDEN",
    );
  });

  it("lets the borrower cancel a pending request", async () => {
    const t = setup();
    const { borrower, loanId } = await pendingLoan(t);
    await borrower.asUser.mutation(api.loans.cancel, { loanId });
    expect(await loanStatus(t, loanId)).toBe("cancelled");
  });

  it("stops the lender and strangers cancelling", async () => {
    const t = setup();
    const { lender, loanId } = await pendingLoan(t);
    const { asUser: mallory } = await signIn(t, "mallory");
    await expectAppError(
      lender.asUser.mutation(api.loans.cancel, { loanId }),
      "FORBIDDEN",
    );
    await expectAppError(
      mallory.mutation(api.loans.cancel, { loanId }),
      "FORBIDDEN",
    );
  });

  it("rejects cancelling an approved loan", async () => {
    const t = setup();
    const { lender, borrower, loanId } = await pendingLoan(t);
    await lender.asUser.mutation(api.loans.approve, { loanId });
    await expectAppError(
      borrower.asUser.mutation(api.loans.cancel, { loanId }),
      "CONFLICT",
    );
  });

  it("rejects approving a request whose dates have passed", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await lenderAndBorrower(t);
    const loanId = await insertLoan(t, toolId, lender.userId, borrower.userId, {
      startDate: "2020-01-01",
      endDate: "2020-01-05",
    });
    await expectAppError(
      lender.asUser.mutation(api.loans.approve, { loanId }),
      "CONFLICT",
    );
  });

  it("lets only the lender mark a loan returned, and records when", async () => {
    const t = setup();
    const { lender, borrower, loanId } = await pendingLoan(t);
    await lender.asUser.mutation(api.loans.approve, { loanId });

    await expectAppError(
      borrower.asUser.mutation(api.loans.markReturned, { loanId }),
      "FORBIDDEN",
    );

    await lender.asUser.mutation(api.loans.markReturned, { loanId });
    const loan = await t.run((ctx) => ctx.db.get("loans", loanId));
    expect(loan?.status).toBe("returned");
    expect(loan?.returnedAt).toBeTypeOf("number");
  });

  it("rejects marking a pending loan returned", async () => {
    const t = setup();
    const { lender, loanId } = await pendingLoan(t);
    await expectAppError(
      lender.asUser.mutation(api.loans.markReturned, { loanId }),
      "CONFLICT",
    );
  });

  it("still lets the lender mark returned after an admin removes the listing", async () => {
    const t = setup();
    const { asAdmin } = await signInAdmin(t);
    const { lender, toolId, loanId } = await pendingLoan(t);
    await lender.asUser.mutation(api.loans.approve, { loanId });

    await asAdmin.mutation(api.admin.removeListing, { toolId });
    await lender.asUser.mutation(api.loans.markReturned, { loanId });

    expect(await loanStatus(t, loanId)).toBe("returned");
  });

  it("stops owners deleting a tool that is out on an approved loan", async () => {
    const t = setup();
    const { lender, toolId, loanId } = await pendingLoan(t);
    await lender.asUser.mutation(api.loans.approve, { loanId });
    await expectAppError(
      lender.asUser.mutation(api.tools.remove, { toolId }),
      "CONFLICT",
    );
  });
});

describe("views", () => {
  it("shows each user only their own side of a loan", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await lenderAndBorrower(t);
    const { asUser: mallory } = await signIn(t, "mallory");
    await insertLoan(t, toolId, lender.userId, borrower.userId);

    expect(await lender.asUser.query(api.loans.listIncoming, {})).toHaveLength(1);
    expect(await lender.asUser.query(api.loans.listMine, {})).toHaveLength(0);
    expect(await borrower.asUser.query(api.loans.listMine, {})).toHaveLength(1);
    expect(await borrower.asUser.query(api.loans.listIncoming, {})).toHaveLength(0);
    expect(await mallory.query(api.loans.listMine, {})).toHaveLength(0);
    expect(await mallory.query(api.loans.listIncoming, {})).toHaveLength(0);
  });

  it("never sends participant emails in loan or tool views", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await lenderAndBorrower(t);
    await insertLoan(t, toolId, lender.userId, borrower.userId);

    const responses = await Promise.all([
      lender.asUser.query(api.loans.listIncoming, {}),
      borrower.asUser.query(api.loans.listMine, {}),
      borrower.asUser.query(api.tools.list, {}),
    ]);

    expect(JSON.stringify(responses)).not.toContain("@example.com");
  });

  it("reports availability from approved loans that have started", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await lenderAndBorrower(t);
    const availability = async () =>
      (await borrower.asUser.query(api.tools.list, {}))[0].availability;

    expect(await availability()).toBe("available");

    // Approved, but starting later: still available today.
    await insertLoan(t, toolId, lender.userId, borrower.userId, {
      status: "approved",
    });
    expect(await availability()).toBe("available");

    // Overdue and not yet returned: still on loan.
    await insertLoan(t, toolId, lender.userId, borrower.userId, {
      startDate: "2020-01-01",
      endDate: "2020-01-05",
      status: "approved",
    });
    expect(await availability()).toBe("on_loan");
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });

  it("filters tools by category", async () => {
    const t = setup();
    const { lender, borrower } = await lenderAndBorrower(t);
    await lender.asUser.mutation(api.tools.create, {
      ...validTool,
      name: "Rake",
      category: "garden",
    });

    const garden = await borrower.asUser.query(api.tools.list, {
      category: "garden",
    });
    expect(garden.map((tool) => tool.name)).toEqual(["Rake"]);
    expect(await borrower.asUser.query(api.tools.list, {})).toHaveLength(2);
  });

  it("hides deleted tools from every list", async () => {
    const t = setup();
    const { lender, borrower, toolId } = await lenderAndBorrower(t);
    await lender.asUser.mutation(api.tools.remove, { toolId });

    expect(await borrower.asUser.query(api.tools.list, {})).toEqual([]);
    expect(await lender.asUser.query(api.tools.listMine, {})).toEqual([]);
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });

  it("marks trusted lenders on their listings", async () => {
    const t = setup();
    const { asAdmin } = await signInAdmin(t);
    const { lender, borrower } = await lenderAndBorrower(t);
    await asAdmin.mutation(api.admin.setTrustedLender, {
      userId: lender.userId,
      isTrusted: true,
    });

    const [tool] = await borrower.asUser.query(api.tools.list, {});
    expect(tool.ownerIsTrusted).toBe(true);
  });

  it("restricts the all-loans and all-users lists to admins", async () => {
    const t = setup();
    const { asAdmin } = await signInAdmin(t);
    const { lender, borrower, toolId } = await lenderAndBorrower(t);
    await insertLoan(t, toolId, lender.userId, borrower.userId);

    expect(await asAdmin.query(api.admin.listLoans, {})).toHaveLength(1);
    expect(await asAdmin.query(api.admin.listUsers, {})).toHaveLength(3);

    await expectAppError(
      lender.asUser.query(api.admin.listLoans, {}),
      "FORBIDDEN",
    );
    await expectAppError(
      lender.asUser.query(api.admin.listUsers, {}),
      "FORBIDDEN",
    );
  });
});
