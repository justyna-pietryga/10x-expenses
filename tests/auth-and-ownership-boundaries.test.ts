import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase";
import { updateCategory, type BudgetCategory, type MonthlyIncome } from "@/lib/budget/data";
import { deleteRule, type CategorizationRule } from "@/lib/rules/data";
import { loadDashboardSummary } from "@/lib/summary/data";
import {
  loadImportBatchReview,
  markBatchReviewComplete,
  type ImportBatch,
  type ImportedTransaction,
} from "@/lib/imports/data";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

const USER_A = {
  email: "owner@example.com",
  id: "user-1",
};

const USER_B = {
  email: "other@example.com",
  id: "user-2",
};

const CREATED_AT = "2026-06-09T08:00:00.000Z";
const VALID_REVOLUT_CSV = readFileSync(
  resolve(process.cwd(), "context/foundation/resources/revolut-statement-example.csv"),
  "utf8",
);

function makeCategory(id: string, userId = USER_A.id, overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    archived_at: null,
    carryover_enabled: false,
    created_at: CREATED_AT,
    id,
    name: `Category ${id}`,
    percentage_limit: 20,
    updated_at: CREATED_AT,
    user_id: userId,
    ...overrides,
  };
}

function makeIncome(id: string, userId = USER_A.id, overrides: Partial<MonthlyIncome> = {}): MonthlyIncome {
  return {
    amount: 4200,
    created_at: CREATED_AT,
    id,
    is_estimated: false,
    month: "2026-06-01",
    updated_at: CREATED_AT,
    user_id: userId,
    ...overrides,
  };
}

function makeBatch(id: string, userId = USER_A.id, overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    bank: "revolut",
    created_at: CREATED_AT,
    id,
    imported_at: CREATED_AT,
    period_end: "2026-06-30",
    period_start: "2026-06-01",
    review_completed_at: null,
    source_filename: "statement.csv",
    statement_month: "2026-06-01",
    updated_at: CREATED_AT,
    user_id: userId,
    ...overrides,
  };
}

function makeTransaction(
  id: string,
  userId = USER_A.id,
  overrides: Partial<ImportedTransaction> = {},
): ImportedTransaction {
  return {
    amount: -12.34,
    category_id: null,
    created_at: CREATED_AT,
    id,
    import_batch_id: "batch-1",
    recipient: `Recipient ${id}`,
    title: `Title ${id}`,
    transaction_date: "2026-06-03",
    updated_at: CREATED_AT,
    user_id: userId,
    ...overrides,
  };
}

function makeRule(id: string, userId = USER_A.id, overrides: Partial<CategorizationRule> = {}): CategorizationRule {
  return {
    created_at: CREATED_AT,
    id,
    match_field: "recipient",
    match_text: "merchant",
    target_category_id: "cat-1",
    updated_at: CREATED_AT,
    user_id: userId,
    ...overrides,
  };
}

interface SummaryRecord {
  created_at: string;
  generated_at: string;
  id: string;
  month: string;
  summary_snapshot: Record<string, unknown>;
  total_income: number;
  total_spent: number;
  updated_at: string;
  user_id: string;
}

function makeSummary(id: string, userId = USER_A.id, overrides: Partial<SummaryRecord> = {}): SummaryRecord {
  return {
    created_at: CREATED_AT,
    generated_at: CREATED_AT,
    id,
    month: "2026-06-01",
    summary_snapshot: {},
    total_income: 4200,
    total_spent: 1200,
    updated_at: CREATED_AT,
    user_id: userId,
    ...overrides,
  };
}

type OwnershipStatus = 200 | 403 | 404;

function classifyOwnership<T extends { id: string; user_id: string }>(
  rows: T[],
  currentUserId: string,
  recordId: string,
): OwnershipStatus {
  const exact = rows.find((row) => row.id === recordId);
  if (!exact) {
    return 404;
  }

  return exact.user_id === currentUserId ? 200 : 403;
}

function authenticatedContext(user = USER_A) {
  return {
    cookies: {} as never,
    locals: { user },
    params: {},
    redirect: vi.fn(),
  };
}

function unauthenticatedContext() {
  return {
    cookies: {} as never,
    locals: { user: null },
    params: {},
    redirect: vi.fn(),
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json();
  return payload as T;
}

interface OwnershipState {
  batches: ImportBatch[];
  categories: BudgetCategory[];
  monthlyIncomes: MonthlyIncome[];
  monthlySummaries: SummaryRecord[];
  rules: CategorizationRule[];
  transactions: ImportedTransaction[];
}

function createOwnershipState(overrides: Partial<OwnershipState> = {}): OwnershipState {
  return {
    batches: [makeBatch("batch-1", USER_A.id), makeBatch("batch-2", USER_B.id, { source_filename: "other.csv" })],
    categories: [
      makeCategory("cat-1", USER_A.id, { name: "Food" }),
      makeCategory("cat-2", USER_B.id, { name: "Travel" }),
    ],
    monthlyIncomes: [makeIncome("income-1", USER_A.id), makeIncome("income-2", USER_B.id, { amount: 5100 })],
    monthlySummaries: [
      makeSummary("summary-1", USER_A.id),
      makeSummary("summary-2", USER_B.id, { total_income: 5100, total_spent: 1800 }),
    ],
    rules: [
      makeRule("rule-1", USER_A.id, { target_category_id: "cat-1" }),
      makeRule("rule-2", USER_B.id, { target_category_id: "cat-2" }),
    ],
    transactions: [
      makeTransaction("tx-1", USER_A.id, { import_batch_id: "batch-1" }),
      makeTransaction("tx-2", USER_B.id, { import_batch_id: "batch-2" }),
    ],
    ...overrides,
  };
}

function createSelectResult<T>(data: T, error: { code?: string; message: string } | null = null) {
  return {
    data,
    error,
  };
}

function notFoundResult() {
  return {
    data: null,
    error: {
      code: "PGRST116",
      message: "not found",
    },
  };
}

function createOwnershipSupabaseStub(state = createOwnershipState()) {
  return {
    __state: state,
    from(table: string) {
      if (table === "budget_categories") {
        return {
          insert: vi.fn((payload: Omit<BudgetCategory, "archived_at" | "created_at" | "id" | "updated_at">) => {
            const created = makeCategory(`cat-created-${state.categories.length + 1}`, payload.user_id, {
              carryover_enabled: payload.carryover_enabled,
              name: payload.name,
              percentage_limit: payload.percentage_limit,
            });
            state.categories.push(created);

            return {
              select() {
                return this;
              },
              async single() {
                return createSelectResult(created);
              },
            };
          }),
          select: vi.fn(() => {
            let userFilter: string | null = null;
            let archivedAtFilter: string | null | undefined;
            const chain = {
              eq(field: string, value: string) {
                if (field === "user_id") {
                  userFilter = value;
                }
                return chain;
              },
              is(field: string, value: string | null) {
                if (field === "archived_at") {
                  archivedAtFilter = value;
                }
                return chain;
              },
              order: vi.fn(async () =>
                createSelectResult(
                  state.categories.filter(
                    (category) =>
                      (!userFilter || category.user_id === userFilter) &&
                      (archivedAtFilter === undefined || category.archived_at === archivedAtFilter),
                  ),
                ),
              ),
            };
            return chain;
          }),
          update: vi.fn((payload: Partial<BudgetCategory>) => {
            let categoryId: string | null = null;
            let ownerId: string | null = null;
            let archivedAtFilter: string | null | undefined;
            const chain = {
              eq(field: string, value: string) {
                if (field === "id") {
                  categoryId = value;
                }
                if (field === "user_id") {
                  ownerId = value;
                }
                return chain;
              },
              is(field: string, value: string | null) {
                if (field === "archived_at") {
                  archivedAtFilter = value;
                }
                return chain;
              },
              select() {
                return chain;
              },
              async single() {
                const category = state.categories.find(
                  (item) =>
                    item.id === categoryId &&
                    item.user_id === ownerId &&
                    (archivedAtFilter === undefined || item.archived_at === archivedAtFilter),
                );

                if (!category) {
                  return notFoundResult();
                }

                Object.assign(category, payload, { updated_at: CREATED_AT });
                return createSelectResult({ ...category });
              },
            };
            return chain;
          }),
        };
      }

      if (table === "monthly_incomes") {
        return {
          select: vi.fn(() => {
            let userFilter: string | null = null;
            let monthFilter: string | null = null;
            const chain = {
              eq(field: string, value: string) {
                if (field === "user_id") {
                  userFilter = value;
                }
                if (field === "month") {
                  monthFilter = value;
                }
                return chain;
              },
              async maybeSingle() {
                const income =
                  state.monthlyIncomes.find(
                    (item) =>
                      (!userFilter || item.user_id === userFilter) && (!monthFilter || item.month === monthFilter),
                  ) ?? null;
                return createSelectResult(income);
              },
              order: vi.fn(async () =>
                createSelectResult(
                  state.monthlyIncomes
                    .filter((item) => !userFilter || item.user_id === userFilter)
                    .map((item) => ({ month: item.month })),
                ),
              ),
            };
            return chain;
          }),
          upsert: vi.fn((payload: Omit<MonthlyIncome, "created_at" | "id" | "updated_at">) => {
            const existing = state.monthlyIncomes.find(
              (item) => item.user_id === payload.user_id && item.month === payload.month,
            );
            const saved =
              existing ??
              makeIncome(`income-created-${state.monthlyIncomes.length + 1}`, payload.user_id, {
                month: payload.month,
              });

            Object.assign(saved, {
              amount: payload.amount,
              is_estimated: payload.is_estimated,
              updated_at: CREATED_AT,
            });

            if (!existing) {
              state.monthlyIncomes.push(saved);
            }

            return {
              select() {
                return this;
              },
              async single() {
                return createSelectResult(saved);
              },
            };
          }),
        };
      }

      if (table === "statement_import_batches") {
        return {
          insert: vi.fn((payload: Omit<ImportBatch, "created_at" | "id" | "imported_at" | "updated_at">) => {
            const created = makeBatch(`batch-created-${state.batches.length + 1}`, payload.user_id, {
              bank: payload.bank,
              period_end: payload.period_end,
              period_start: payload.period_start,
              review_completed_at: payload.review_completed_at,
              source_filename: payload.source_filename,
              statement_month: payload.statement_month,
            });
            state.batches.push(created);

            return {
              select() {
                return this;
              },
              async single() {
                return createSelectResult(created);
              },
            };
          }),
          select: vi.fn(() => {
            let idFilter: string | null = null;
            let userFilter: string | null = null;
            let monthFilter: string | null = null;
            const chain = {
              eq(field: string, value: string) {
                if (field === "id") {
                  idFilter = value;
                }
                if (field === "user_id") {
                  userFilter = value;
                }
                if (field === "statement_month") {
                  monthFilter = value;
                }
                return chain;
              },
              lte() {
                return chain;
              },
              limit() {
                return chain;
              },
              async maybeSingle() {
                const batch =
                  state.batches.find(
                    (item) =>
                      (!idFilter || item.id === idFilter) &&
                      (!userFilter || item.user_id === userFilter) &&
                      (!monthFilter || item.statement_month === monthFilter),
                  ) ?? null;
                return createSelectResult(batch);
              },
              order: vi.fn(async () =>
                createSelectResult(
                  state.batches.filter(
                    (item) =>
                      (!idFilter || item.id === idFilter) &&
                      (!userFilter || item.user_id === userFilter) &&
                      (!monthFilter || item.statement_month === monthFilter),
                  ),
                ),
              ),
              async single() {
                const batch = state.batches.find(
                  (item) =>
                    (!idFilter || item.id === idFilter) &&
                    (!userFilter || item.user_id === userFilter) &&
                    (!monthFilter || item.statement_month === monthFilter),
                );

                if (!batch) {
                  return notFoundResult();
                }

                return createSelectResult(batch);
              },
            };
            return chain;
          }),
          update: vi.fn((payload: Partial<ImportBatch>) => {
            let batchId: string | null = null;
            let ownerId: string | null = null;
            const chain = {
              eq(field: string, value: string) {
                if (field === "id") {
                  batchId = value;
                }
                if (field === "user_id") {
                  ownerId = value;
                }
                return chain;
              },
              select() {
                return chain;
              },
              async single() {
                const batch = state.batches.find((item) => item.id === batchId && item.user_id === ownerId);

                if (!batch) {
                  return notFoundResult();
                }

                Object.assign(batch, payload, { updated_at: CREATED_AT });
                return createSelectResult({ ...batch });
              },
            };
            return chain;
          }),
        };
      }

      if (table === "transactions") {
        return {
          insert: vi.fn((rows: Omit<ImportedTransaction, "created_at" | "id" | "updated_at">[]) => {
            const created = rows.map((row, index) =>
              makeTransaction(`tx-created-${state.transactions.length + index + 1}`, row.user_id, {
                amount: row.amount,
                category_id: row.category_id ?? null,
                import_batch_id: row.import_batch_id,
                recipient: row.recipient,
                title: row.title,
                transaction_date: row.transaction_date,
              }),
            );
            state.transactions.push(...created);

            return {
              async select() {
                return createSelectResult(created);
              },
            };
          }),
          select: vi.fn(() => {
            let batchFilter: string | null = null;
            let userFilter: string | null = null;
            let batchIds: string[] | null = null;
            const chain = {
              eq(field: string, value: string) {
                if (field === "import_batch_id") {
                  batchFilter = value;
                }
                if (field === "user_id") {
                  userFilter = value;
                }
                return chain;
              },
              in(field: string, values: string[]) {
                if (field === "import_batch_id") {
                  batchIds = values;
                }
                return chain;
              },
              order: vi.fn(async () =>
                createSelectResult(
                  state.transactions.filter(
                    (item) =>
                      (!batchFilter || item.import_batch_id === batchFilter) &&
                      (!userFilter || item.user_id === userFilter) &&
                      (!batchIds || batchIds.includes(item.import_batch_id)),
                  ),
                ),
              ),
            };
            return chain;
          }),
          update: vi.fn((payload: Partial<ImportedTransaction>) => {
            let transactionId: string | null = null;
            let ownerId: string | null = null;
            const chain = {
              eq(field: string, value: string) {
                if (field === "id") {
                  transactionId = value;
                }
                if (field === "user_id") {
                  ownerId = value;
                }
                return chain;
              },
              select() {
                return chain;
              },
              async single() {
                const transaction = state.transactions.find(
                  (item) => item.id === transactionId && item.user_id === ownerId,
                );

                if (!transaction) {
                  return notFoundResult();
                }

                Object.assign(transaction, payload, { updated_at: CREATED_AT });
                return createSelectResult({ ...transaction });
              },
            };
            return chain;
          }),
        };
      }

      if (table === "categorization_rules") {
        return {
          delete: vi.fn(() => {
            let ruleId: string | null = null;
            let ownerId: string | null = null;
            const chain = {
              eq(field: string, value: string) {
                if (field === "id") {
                  ruleId = value;
                }
                if (field === "user_id") {
                  ownerId = value;
                }
                return chain;
              },
              select() {
                return chain;
              },
              async single() {
                const index = state.rules.findIndex((item) => item.id === ruleId && item.user_id === ownerId);
                if (index === -1) {
                  return notFoundResult();
                }

                const [removed] = state.rules.splice(index, 1);
                return createSelectResult(removed);
              },
            };
            return chain;
          }),
          select: vi.fn(() => {
            let userFilter: string | null = null;
            const chain = {
              eq(field: string, value: string) {
                if (field === "user_id") {
                  userFilter = value;
                }
                return chain;
              },
              order: vi.fn(async () =>
                createSelectResult(state.rules.filter((item) => !userFilter || item.user_id === userFilter)),
              ),
            };
            return chain;
          }),
          update: vi.fn((payload: Partial<CategorizationRule>) => {
            let ruleId: string | null = null;
            let ownerId: string | null = null;
            const chain = {
              eq(field: string, value: string) {
                if (field === "id") {
                  ruleId = value;
                }
                if (field === "user_id") {
                  ownerId = value;
                }
                return chain;
              },
              select() {
                return chain;
              },
              async single() {
                const rule = state.rules.find((item) => item.id === ruleId && item.user_id === ownerId);
                if (!rule) {
                  return notFoundResult();
                }

                Object.assign(rule, payload, { updated_at: CREATED_AT });
                return createSelectResult({ ...rule });
              },
            };
            return chain;
          }),
        };
      }

      if (table === "monthly_summaries") {
        return {
          select: vi.fn(() => {
            let userFilter: string | null = null;
            let monthFilter: string | null = null;
            const chain = {
              eq(field: string, value: string) {
                if (field === "user_id") {
                  userFilter = value;
                }
                if (field === "month") {
                  monthFilter = value;
                }
                return chain;
              },
              async maybeSingle() {
                const summary =
                  state.monthlySummaries.find(
                    (item) =>
                      (!userFilter || item.user_id === userFilter) && (!monthFilter || item.month === monthFilter),
                  ) ?? null;
                return createSelectResult(summary);
              },
            };
            return chain;
          }),
          upsert: vi.fn(() => ({
            select() {
              return this;
            },
            async single() {
              return createSelectResult(state.monthlySummaries[0] ?? null);
            },
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("ownership harness fixtures", () => {
  it("provides builders for all finance-domain records used by ownership coverage", () => {
    const state = createOwnershipState();

    expect(state.categories).toHaveLength(2);
    expect(state.monthlyIncomes).toHaveLength(2);
    expect(state.batches).toHaveLength(2);
    expect(state.transactions).toHaveLength(2);
    expect(state.rules).toHaveLength(2);
    expect(state.monthlySummaries).toHaveLength(2);
    expect(state.categories.map((category) => category.user_id)).toEqual([USER_A.id, USER_B.id]);
  });

  it("distinguishes owned, foreign-owned, and missing records as separate ownership outcomes", () => {
    const state = createOwnershipState();

    expect(classifyOwnership(state.categories, USER_A.id, "cat-1")).toBe(200);
    expect(classifyOwnership(state.categories, USER_A.id, "cat-2")).toBe(403);
    expect(classifyOwnership(state.categories, USER_A.id, "cat-missing")).toBe(404);
  });
});

describe("budget ownership baselines", () => {
  it("keeps unauthenticated category routes at 401", async () => {
    const categoryItemRoute: typeof import("@/pages/api/budget/categories/[id]") =
      await import("@/pages/api/budget/categories/[id]");

    const response = await categoryItemRoute.DELETE({
      ...unauthenticatedContext(),
      params: { id: "cat-1" },
      request: new Request("http://localhost/api/budget/categories/cat-1", { method: "DELETE" }),
    } as never);

    expect(response.status).toBe(401);
  });

  it("keeps missing owned categories at 404 until explicit cross-user denial is implemented", async () => {
    const supabase = createOwnershipSupabaseStub();

    await expect(
      updateCategory(supabase as never, USER_A.id, "cat-missing", {
        carryover_enabled: false,
        name: "Food",
        percentage_limit: 25,
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("import ownership baselines", () => {
  it("keeps unauthenticated batch-complete routes at 401", async () => {
    const completeRoute: typeof import("@/pages/api/imports/batches/[id]/complete") =
      await import("@/pages/api/imports/batches/[id]/complete");

    const response = await completeRoute.POST({
      ...unauthenticatedContext(),
      params: { id: "batch-1" },
      request: new Request("http://localhost/api/imports/batches/batch-1/complete", { method: "POST" }),
    } as never);

    expect(response.status).toBe(401);
  });

  it("keeps missing owned batches at 404 until explicit cross-user denial is implemented", async () => {
    const supabase = createOwnershipSupabaseStub();

    await expect(markBatchReviewComplete(supabase as never, USER_A.id, "batch-missing")).rejects.toThrow(/not found/i);
  });
});

describe("rules and summary ownership baselines", () => {
  it("keeps unauthenticated summary and rules routes at 401", async () => {
    const summaryRoute: typeof import("@/pages/api/dashboard/summary") = await import("@/pages/api/dashboard/summary");
    const ruleRoute: typeof import("@/pages/api/rules/[id]") = await import("@/pages/api/rules/[id]");

    const summaryResponse = await summaryRoute.GET({
      ...unauthenticatedContext(),
      request: new Request("http://localhost/api/dashboard/summary"),
    } as never);
    const ruleResponse = await ruleRoute.DELETE({
      ...unauthenticatedContext(),
      params: { id: "rule-1" },
      request: new Request("http://localhost/api/rules/rule-1", { method: "DELETE" }),
    } as never);

    expect(summaryResponse.status).toBe(401);
    expect(ruleResponse.status).toBe(401);
  });

  it("keeps missing owned rules at 404 until explicit cross-user denial is implemented", async () => {
    const supabase = createOwnershipSupabaseStub();

    await expect(deleteRule(supabase as never, USER_A.id, "rule-missing")).rejects.toThrow(/not found/i);
  });

  it("loads a summary from the current user's isolated finance state in the harness", async () => {
    const supabase = createOwnershipSupabaseStub({
      categories: [makeCategory("cat-1", USER_A.id, { name: "Food" })],
      monthlyIncomes: [makeIncome("income-1", USER_A.id, { amount: 3000 })],
      batches: [makeBatch("batch-1", USER_A.id, { review_completed_at: "2026-06-10T08:00:00.000Z" })],
      transactions: [makeTransaction("tx-1", USER_A.id, { category_id: "cat-1", import_batch_id: "batch-1" })],
      monthlySummaries: [makeSummary("summary-1", USER_A.id)],
      rules: [],
    });

    const summary = await loadDashboardSummary(supabase as never, USER_A.id, "2026-06-01");

    expect(summary.available_months).toEqual([
      {
        has_completed_review: true,
        has_income: true,
        has_pending_review: false,
        month: "2026-06-01",
      },
    ]);
    expect(summary.selected_month).toBe("2026-06-01");
  });
});

describe("adapted ownership contract under anon-key plus RLS", () => {
  it("keeps foreign budget category mutations hidden behind the same 404 route contract", async () => {
    const categoryItemRoute: typeof import("@/pages/api/budget/categories/[id]") =
      await import("@/pages/api/budget/categories/[id]");
    const supabase = createOwnershipSupabaseStub();
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await categoryItemRoute.DELETE({
      ...authenticatedContext(USER_A),
      params: { id: "cat-2" },
      request: new Request("http://localhost/api/budget/categories/cat-2", { method: "DELETE" }),
    } as never);

    expect(response.status).toBe(404);
    await expect(readJson<{ error: string; field: string | null }>(response)).resolves.toEqual({
      error: "Active category was not found",
      field: null,
    });
  });

  it("keeps foreign import batch review loads and completion hidden behind not-found behavior", async () => {
    const completeRoute: typeof import("@/pages/api/imports/batches/[id]/complete") =
      await import("@/pages/api/imports/batches/[id]/complete");
    const supabase = createOwnershipSupabaseStub();
    vi.mocked(createClient).mockReturnValue(supabase as never);

    await expect(loadImportBatchReview(supabase as never, USER_A.id, "batch-2")).rejects.toThrow(/not found/i);

    const response = await completeRoute.POST({
      ...authenticatedContext(USER_A),
      params: { id: "batch-2" },
      request: new Request("http://localhost/api/imports/batches/batch-2/complete", { method: "POST" }),
    } as never);

    expect(response.status).toBe(404);
    await expect(readJson<{ error: string; field: string | null }>(response)).resolves.toEqual({
      error: "Import batch was not found",
      field: null,
    });
  });

  it("keeps foreign import transaction mutations hidden at both single-row and bulk boundaries", async () => {
    const transactionRoute: typeof import("@/pages/api/imports/transactions/[id]") =
      await import("@/pages/api/imports/transactions/[id]");
    const bulkRoute: typeof import("@/pages/api/imports/transactions/bulk") =
      await import("@/pages/api/imports/transactions/bulk");
    const supabase = createOwnershipSupabaseStub();
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const singleResponse = await transactionRoute.PATCH({
      ...authenticatedContext(USER_A),
      params: { id: "tx-2" },
      request: new Request("http://localhost/api/imports/transactions/tx-2", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category_id: "cat-1", save_rule: false }),
      }),
    } as never);

    expect(singleResponse.status).toBe(404);
    await expect(readJson<{ error: string; field: string | null }>(singleResponse)).resolves.toEqual({
      error: "Imported transaction was not found",
      field: null,
    });

    const bulkResponse = await bulkRoute.PATCH({
      ...authenticatedContext(USER_A),
      request: new Request("http://localhost/api/imports/transactions/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          updates: [{ category_id: "cat-1", transaction_id: "tx-2" }],
        }),
      }),
    } as never);

    expect(bulkResponse.status).toBe(200);
    await expect(
      readJson<{ failed: { error: string; transaction_id: string }[]; updated: unknown[] }>(bulkResponse),
    ).resolves.toEqual({
      failed: [{ error: "Imported transaction was not found", transaction_id: "tx-2" }],
      updated: [],
    });
  });

  it("keeps foreign rules and foreign target categories hidden behind not-found style errors", async () => {
    const ruleItemRoute: typeof import("@/pages/api/rules/[id]") = await import("@/pages/api/rules/[id]");
    const ruleCollectionRoute: typeof import("@/pages/api/rules/index") = await import("@/pages/api/rules/index");
    const supabase = createOwnershipSupabaseStub();
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const deleteResponse = await ruleItemRoute.DELETE({
      ...authenticatedContext(USER_A),
      params: { id: "rule-2" },
      request: new Request("http://localhost/api/rules/rule-2", { method: "DELETE" }),
    } as never);

    expect(deleteResponse.status).toBe(404);
    await expect(readJson<{ error: string; field: string | null }>(deleteResponse)).resolves.toEqual({
      error: "Categorization rule was not found",
      field: null,
    });

    const createResponse = await ruleCollectionRoute.POST({
      ...authenticatedContext(USER_A),
      request: new Request("http://localhost/api/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          match_field: "recipient",
          match_text: "merchant",
          target_category_id: "cat-2",
        }),
      }),
      params: {},
    } as never);

    expect(createResponse.status).toBe(404);
    await expect(readJson<{ error: string; field: string | null }>(createResponse)).resolves.toEqual({
      error: "Selected category was not found",
      field: "target_category_id",
    });
  });
});

describe("budget ownership coverage", () => {
  it("keeps category reads and income reads scoped to the authenticated user", async () => {
    const supabase = createOwnershipSupabaseStub({
      categories: [
        makeCategory("cat-a", USER_A.id, { name: "Food" }),
        makeCategory("cat-b", USER_B.id, { name: "Travel" }),
      ],
      monthlyIncomes: [
        makeIncome("income-a", USER_A.id, { amount: 3000, month: "2026-06-01" }),
        makeIncome("income-b", USER_B.id, { amount: 5100, month: "2026-06-01" }),
      ],
    });
    const { listActiveCategories, loadMonthlyIncome } = await import("@/lib/budget/data");

    await expect(listActiveCategories(supabase as never, USER_A.id)).resolves.toEqual([
      expect.objectContaining({ id: "cat-a", user_id: USER_A.id }),
    ]);
    await expect(loadMonthlyIncome(supabase as never, USER_A.id, "2026-06-01")).resolves.toEqual(
      expect.objectContaining({ id: "income-a", user_id: USER_A.id }),
    );
  });

  it("keeps income writes scoped to the authenticated user", async () => {
    const incomeRoute: typeof import("@/pages/api/budget/income") = await import("@/pages/api/budget/income");
    const supabase = createOwnershipSupabaseStub();
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await incomeRoute.POST({
      ...authenticatedContext(USER_A),
      request: new Request("http://localhost/api/budget/income", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month: "2026-07", amount: 3800, is_estimated: true }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson<{ income: MonthlyIncome }>(response)).resolves.toEqual({
      income: expect.objectContaining({
        month: "2026-07-01",
        user_id: USER_A.id,
      }),
    });
    expect(
      supabase.__state.monthlyIncomes.some((income) => income.user_id === USER_B.id && income.month === "2026-07-01"),
    ).toBe(false);
  });

  it("keeps category creation scoped to the authenticated user", async () => {
    const categoryCollectionRoute: typeof import("@/pages/api/budget/categories/index") =
      await import("@/pages/api/budget/categories/index");
    const supabase = createOwnershipSupabaseStub();
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await categoryCollectionRoute.POST({
      ...authenticatedContext(USER_A),
      request: new Request("http://localhost/api/budget/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ carryover_enabled: true, name: "Health", percentage_limit: 15 }),
      }),
      params: {},
    } as never);

    expect(response.status).toBe(201);
    await expect(readJson<{ category: BudgetCategory }>(response)).resolves.toEqual({
      category: expect.objectContaining({ name: "Health", user_id: USER_A.id }),
    });
    expect(
      supabase.__state.categories.some((category) => category.name === "Health" && category.user_id === USER_B.id),
    ).toBe(false);
  });
});

describe("import ownership coverage", () => {
  it("keeps existing batch lookup scoped to the authenticated user", async () => {
    const supabase = createOwnershipSupabaseStub({
      batches: [
        makeBatch("batch-owner", USER_A.id, { bank: "revolut", statement_month: "2026-06-01" }),
        makeBatch("batch-other", USER_B.id, { bank: "revolut", statement_month: "2026-06-01" }),
      ],
    });
    const { findExistingImportBatch } = await import("@/lib/imports/data");

    await expect(findExistingImportBatch(supabase as never, USER_A.id, "revolut", "2026-06-01")).resolves.toEqual(
      expect.objectContaining({ id: "batch-owner", user_id: USER_A.id }),
    );
  });

  it("keeps preview batch lookup scoped to the authenticated user", async () => {
    const previewRoute: typeof import("@/pages/api/imports/preview") = await import("@/pages/api/imports/preview");
    const supabase = createOwnershipSupabaseStub({
      batches: [makeBatch("batch-other-only", USER_B.id, { bank: "revolut", statement_month: "2026-05-01" })],
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const formData = new FormData();
    formData.set("bank", "revolut");
    formData.set("file", new File([VALID_REVOLUT_CSV], "owner.csv", { type: "text/csv" }));

    const response = await previewRoute.POST({
      ...authenticatedContext(USER_A),
      request: new Request("http://localhost/api/imports/preview", {
        method: "POST",
        body: formData,
      }),
      params: {},
    } as never);

    expect(response.status).toBe(200);
    await expect(
      readJson<{ existing_batch: ImportBatch | null; source_filename: string; statement_month: string }>(response),
    ).resolves.toMatchObject({
      existing_batch: null,
      source_filename: "owner.csv",
      statement_month: "2026-05-01",
    });
  });
});
