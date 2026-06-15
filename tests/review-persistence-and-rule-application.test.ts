import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mergeImportedTransactionCategoryUpdates } from "@/components/imports/ImportWorkspace";
import { ReviewCompletionBar } from "@/components/imports/ReviewCompletionBar";
import { buildBulkSaveFeedback, buildDirtyCategoryUpdates } from "@/components/imports/TransactionReviewTable";
import type { BudgetCategory } from "@/lib/budget/data";
import {
  commitImportBatch,
  createImportReviewRule,
  markBatchReviewComplete,
  type CategorizationRule,
  type ImportBatch,
  type ImportedTransaction,
  updateImportTransactionCategories,
} from "@/lib/imports/data";
import type { ImportCommitPayload } from "@/lib/imports/validation";
import { ruleMatchesTransaction } from "@/lib/rules/data";
import { createClient } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

const userId = "user-1";
const createdAt = "2026-06-09T08:00:00.000Z";

const baseCategories: BudgetCategory[] = [
  {
    archived_at: null,
    carryover_enabled: false,
    created_at: "2026-05-01T00:00:00.000Z",
    id: "cat-food",
    name: "Food",
    percentage_limit: 30,
    updated_at: "2026-05-01T00:00:00.000Z",
    user_id: userId,
  },
  {
    archived_at: null,
    carryover_enabled: false,
    created_at: "2026-05-02T00:00:00.000Z",
    id: "cat-housing",
    name: "Housing",
    percentage_limit: 25,
    updated_at: "2026-05-02T00:00:00.000Z",
    user_id: userId,
  },
  {
    archived_at: null,
    carryover_enabled: true,
    created_at: "2026-05-03T00:00:00.000Z",
    id: "cat-travel",
    name: "Travel",
    percentage_limit: 20,
    updated_at: "2026-05-03T00:00:00.000Z",
    user_id: userId,
  },
];

function makeBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    bank: "revolut",
    created_at: createdAt,
    id: "batch-1",
    imported_at: createdAt,
    period_end: "2026-06-30",
    period_start: "2026-06-01",
    review_completed_at: null,
    source_filename: "import.csv",
    statement_month: "2026-06-01",
    updated_at: createdAt,
    user_id: userId,
    ...overrides,
  };
}

function makeTransaction(id: string, overrides: Partial<ImportedTransaction> = {}): ImportedTransaction {
  const { categorized_by_rule_id = null, is_included = true, ...rest } = overrides;

  return {
    amount: -10,
    category_id: null,
    categorized_by_rule_id,
    created_at: createdAt,
    id,
    import_batch_id: "batch-1",
    is_included,
    recipient: `Recipient ${id}`,
    title: `Title ${id}`,
    transaction_date: "2026-06-03",
    updated_at: createdAt,
    user_id: userId,
    ...rest,
  };
}

function makeRule(id: string, overrides: Partial<CategorizationRule> = {}): CategorizationRule {
  return {
    created_at: createdAt,
    id,
    match_field: "recipient",
    match_text: "grocer",
    target_category_id: "cat-food",
    updated_at: createdAt,
    user_id: userId,
    ...overrides,
  };
}

function routeContext(request: Request, params: Record<string, string> = {}) {
  return {
    cookies: {} as never,
    locals: {
      user: {
        email: "user@example.com",
        id: userId,
      },
    },
    params,
    redirect: vi.fn(),
    request,
  } as never;
}

function createInsertManyChain(data: unknown, error: { code?: string; message: string } | null = null) {
  return {
    select: vi.fn().mockResolvedValue({ data, error }),
  };
}

function createSingleResultChain(resolver: () => { data: unknown; error: { code?: string; message: string } | null }) {
  const chain = {
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    select: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(resolver())),
  };

  return chain;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json();
  return payload as T;
}

function buildPhase2SupabaseStub(options?: {
  batch?: ImportBatch;
  categories?: BudgetCategory[];
  failTransactionIds?: string[];
  rules?: CategorizationRule[];
  transactions?: ImportedTransaction[];
}) {
  const categories = options?.categories ? [...options.categories] : [...baseCategories];
  const batches = [options?.batch ?? makeBatch()];
  const failTransactionIds = new Set(options?.failTransactionIds ?? []);
  const rules = [...(options?.rules ?? [])];
  const transactions = new Map(
    (
      options?.transactions ?? [
        makeTransaction("tx-1", { category_id: "cat-food", recipient: "Grocer One", title: "Market bill" }),
        makeTransaction("tx-2", { recipient: "Trainline", title: "Rail ticket" }),
        makeTransaction("tx-3", { recipient: "Old Utility", title: "June rent" }),
      ]
    ).map((transaction) => [transaction.id, { ...transaction }]),
  );
  let batchCounter = batches.length + 1;
  let transactionCounter = transactions.size + 1;
  let ruleCounter = rules.length + 1;

  const nextRuleId = () => `rule-${ruleCounter++}`;
  const nextBatchId = () => `batch-${batchCounter++}`;
  const nextTransactionId = () => `tx-imported-${transactionCounter++}`;

  function listTransactions() {
    return Array.from(transactions.values()).map((transaction) => ({ ...transaction }));
  }

  function listRulesState() {
    return rules.map((rule) => ({ ...rule }));
  }

  const supabase = {
    __state: {
      batches: () => batches.map((batch) => ({ ...batch })),
      rules: listRulesState,
      transactions: listTransactions,
    },
    from: vi.fn((table: string) => {
      if (table === "budget_categories") {
        let data = categories.filter((category) => category.archived_at === null);
        const chain = {
          eq: vi.fn((field: string, value: string) => {
            if (field === "user_id") {
              data = data.filter((category) => category.user_id === value);
            }

            return chain;
          }),
          is: vi.fn((field: string, value: string | null) => {
            if (field === "archived_at") {
              data = data.filter((category) => category.archived_at === value);
            }

            return chain;
          }),
          order: vi.fn(() => Promise.resolve({ data, error: null })),
          select: vi.fn(() => chain),
        };

        return chain;
      }

      if (table === "categorization_rules") {
        return {
          delete: vi.fn(() => {
            let ruleId: string | null = null;
            let ownerId: string | null = null;
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                if (field === "id") {
                  ruleId = value;
                }

                if (field === "user_id") {
                  ownerId = value;
                }

                return chain;
              }),
              select: vi.fn(() => chain),
              single: vi.fn(() => {
                const index = rules.findIndex((rule) => rule.id === ruleId && rule.user_id === ownerId);

                if (index === -1) {
                  return Promise.resolve({
                    data: null,
                    error: { code: "PGRST116", message: "not found" },
                  });
                }

                const [removed] = rules.splice(index, 1);

                return Promise.resolve({
                  data: { ...removed },
                  error: null,
                });
              }),
            };

            return chain;
          }),
          insert: vi.fn((payload: Omit<CategorizationRule, "created_at" | "id" | "updated_at">) => {
            const rule = makeRule(nextRuleId(), payload);
            rules.push(rule);

            return createSingleResultChain(() => ({
              data: { ...rule },
              error: null,
            }));
          }),
          select: vi.fn(() => {
            let data = listRulesState();
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                if (field === "user_id") {
                  data = data.filter((rule) => rule.user_id === value);
                }

                return chain;
              }),
              order: vi.fn(() => Promise.resolve({ data, error: null })),
            };

            return chain;
          }),
          update: vi.fn((payload: Partial<CategorizationRule>) => {
            let ruleId: string | null = null;
            let ownerId: string | null = null;
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                if (field === "id") {
                  ruleId = value;
                }

                if (field === "user_id") {
                  ownerId = value;
                }

                return chain;
              }),
              select: vi.fn(() => chain),
              single: vi.fn(() => {
                const rule = rules.find((item) => item.id === ruleId && item.user_id === ownerId);

                if (!rule) {
                  return Promise.resolve({
                    data: null,
                    error: { code: "PGRST116", message: "not found" },
                  });
                }

                Object.assign(rule, payload, { updated_at: createdAt });

                return Promise.resolve({
                  data: { ...rule },
                  error: null,
                });
              }),
            };

            return chain;
          }),
          upsert: vi.fn((payload: Omit<CategorizationRule, "created_at" | "id" | "updated_at">) => {
            const existingRule = rules.find(
              (rule) =>
                rule.user_id === payload.user_id &&
                rule.match_field === payload.match_field &&
                rule.match_text === payload.match_text,
            );

            if (existingRule) {
              Object.assign(existingRule, payload, { updated_at: createdAt });
            } else {
              rules.push(makeRule(nextRuleId(), payload));
            }

            const resolvedRule = existingRule ?? rules.at(-1);

            if (!resolvedRule) {
              throw new Error("Expected rule upsert to leave one saved rule");
            }

            return createSingleResultChain(() => ({
              data: { ...resolvedRule },
              error: null,
            }));
          }),
        };
      }

      if (table === "statement_import_batches") {
        return {
          insert: vi.fn((payload: Omit<ImportBatch, "created_at" | "id" | "imported_at" | "updated_at">) => {
            const batch = makeBatch({
              bank: payload.bank,
              id: nextBatchId(),
              period_end: payload.period_end,
              period_start: payload.period_start,
              review_completed_at: payload.review_completed_at,
              source_filename: payload.source_filename,
              statement_month: payload.statement_month,
              user_id: payload.user_id,
            });
            batches.push(batch);

            return createSingleResultChain(() => ({
              data: { ...batch },
              error: null,
            }));
          }),
          select: vi.fn(() => {
            let data = batches.map((batch) => ({ ...batch }));
            let idFilter: string | null = null;
            let userFilter: string | null = null;
            let bankFilter: string | null = null;
            let monthFilter: string | null = null;
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                if (field === "id") {
                  idFilter = value;
                }

                if (field === "user_id") {
                  userFilter = value;
                }

                if (field === "bank") {
                  bankFilter = value;
                }

                if (field === "statement_month") {
                  monthFilter = value;
                }

                data = data.filter(
                  (batch) =>
                    (!idFilter || batch.id === idFilter) &&
                    (!userFilter || batch.user_id === userFilter) &&
                    (!bankFilter || batch.bank === bankFilter) &&
                    (!monthFilter || batch.statement_month === monthFilter),
                );

                return chain;
              }),
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: data[0] ?? null,
                  error: null,
                }),
              ),
              order: vi.fn(() => Promise.resolve({ data, error: null })),
              single: vi.fn(() =>
                Promise.resolve({
                  data: data[0] ?? null,
                  error: data[0] ? null : { code: "PGRST116", message: "not found" },
                }),
              ),
            };

            return chain;
          }),
          update: vi.fn((payload: Partial<ImportBatch>) => {
            let batchId: string | null = null;
            let ownerId: string | null = null;
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                if (field === "id") {
                  batchId = value;
                }

                if (field === "user_id") {
                  ownerId = value;
                }

                return chain;
              }),
              select: vi.fn(() => chain),
              single: vi.fn(() => {
                const batch = batches.find((item) => item.id === batchId && item.user_id === ownerId);

                if (!batch) {
                  return Promise.resolve({
                    data: null,
                    error: { code: "PGRST116", message: "not found" },
                  });
                }

                Object.assign(batch, payload, { updated_at: createdAt });

                return Promise.resolve({
                  data: { ...batch },
                  error: null,
                });
              }),
            };

            return chain;
          }),
        };
      }

      if (table === "transactions") {
        return {
          insert: vi.fn((rows: Omit<ImportedTransaction, "created_at" | "id" | "updated_at">[]) => {
            const inserted = rows.map((row) => {
              const transaction = makeTransaction(nextTransactionId(), {
                amount: row.amount,
                category_id: row.category_id ?? null,
                import_batch_id: row.import_batch_id,
                recipient: row.recipient,
                title: row.title,
                transaction_date: row.transaction_date,
                user_id: row.user_id,
              });

              transactions.set(transaction.id, transaction);

              return transaction;
            });

            return createInsertManyChain(inserted);
          }),
          select: vi.fn(() => {
            let userFilter: string | null = null;
            let batchFilter: string | null = null;
            let batchIds: string[] | null = null;
            let transactionIdFilter: string | null = null;
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                if (field === "user_id") {
                  userFilter = value;
                }

                if (field === "import_batch_id") {
                  batchFilter = value;
                }

                if (field === "id") {
                  transactionIdFilter = value;
                }

                return chain;
              }),
              in: vi.fn((field: string, values: string[]) => {
                if (field === "import_batch_id") {
                  batchIds = values;
                }

                return chain;
              }),
              single: vi.fn(() => {
                const data = listTransactions().find(
                  (transaction) =>
                    (!transactionIdFilter || transaction.id === transactionIdFilter) &&
                    (!userFilter || transaction.user_id === userFilter) &&
                    (!batchFilter || transaction.import_batch_id === batchFilter) &&
                    (!batchIds || batchIds.includes(transaction.import_batch_id)),
                );

                return Promise.resolve({
                  data: data ?? null,
                  error: data ? null : { code: "PGRST116", message: "not found" },
                });
              }),
              order: vi.fn(() => {
                const data = listTransactions().filter(
                  (transaction) =>
                    (!transactionIdFilter || transaction.id === transactionIdFilter) &&
                    (!userFilter || transaction.user_id === userFilter) &&
                    (!batchFilter || transaction.import_batch_id === batchFilter) &&
                    (!batchIds || batchIds.includes(transaction.import_batch_id)),
                );

                return Promise.resolve({ data, error: null });
              }),
            };

            return chain;
          }),
          update: vi.fn((payload: Partial<ImportedTransaction>) => {
            let transactionId: string | null = null;
            let ownerId: string | null = null;
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                if (field === "id") {
                  transactionId = value;
                }

                if (field === "user_id") {
                  ownerId = value;
                }

                return chain;
              }),
              select: vi.fn(() => chain),
              single: vi.fn(() => {
                const transaction = transactionId ? transactions.get(transactionId) : null;

                if (transaction?.user_id !== ownerId || failTransactionIds.has(transaction.id)) {
                  return Promise.resolve({
                    data: null,
                    error: { code: "PGRST116", message: "not found" },
                  });
                }

                const updated = {
                  ...transaction,
                  ...payload,
                  updated_at: createdAt,
                };
                transactions.set(updated.id, updated);

                return Promise.resolve({
                  data: { ...updated },
                  error: null,
                });
              }),
            };

            return chain;
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return supabase;
}

describe("review persistence truthfulness", () => {
  it("persists only successful rows and leaves failed rows untouched in mixed bulk saves", async () => {
    const supabase = buildPhase2SupabaseStub({
      failTransactionIds: ["tx-2"],
      transactions: [
        makeTransaction("tx-1", { category_id: "cat-food", recipient: "Grocer One" }),
        makeTransaction("tx-2", { category_id: null, recipient: "Trainline" }),
      ],
    });

    const result = await updateImportTransactionCategories(supabase as never, userId, [
      { category_id: "cat-travel", transaction_id: "tx-1" },
      { category_id: "cat-housing", transaction_id: "tx-2" },
    ]);

    expect(result).toEqual({
      failed: [
        {
          error: "Imported transaction was not found",
          transaction_id: "tx-2",
        },
      ],
      updated: [
        expect.objectContaining({
          category_id: "cat-travel",
          id: "tx-1",
        }),
      ],
    });
    expect(supabase.__state.transactions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_id: "cat-travel", id: "tx-1" }),
        expect.objectContaining({ category_id: null, id: "tx-2" }),
      ]),
    );
  });

  it("reports full failure without mutating persisted rows", async () => {
    const supabase = buildPhase2SupabaseStub({
      failTransactionIds: ["tx-1", "tx-2"],
      transactions: [
        makeTransaction("tx-1", { category_id: "cat-food" }),
        makeTransaction("tx-2", { category_id: null }),
      ],
    });

    const result = await updateImportTransactionCategories(supabase as never, userId, [
      { category_id: "cat-travel", transaction_id: "tx-1" },
      { category_id: "cat-housing", transaction_id: "tx-2" },
    ]);

    expect(result.updated).toEqual([]);
    expect(result.failed).toHaveLength(2);
    expect(supabase.__state.transactions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_id: "cat-food", id: "tx-1" }),
        expect.objectContaining({ category_id: null, id: "tx-2" }),
      ]),
    );
  });

  it("returns truthful mixed-result payloads from the bulk review route", async () => {
    const bulkRoute: typeof import("@/pages/api/imports/transactions/bulk") =
      await import("@/pages/api/imports/transactions/bulk");
    const supabase = buildPhase2SupabaseStub({
      failTransactionIds: ["tx-2"],
      transactions: [
        makeTransaction("tx-1", { category_id: "cat-food" }),
        makeTransaction("tx-2", { category_id: null }),
      ],
    });

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await bulkRoute.PATCH(
      routeContext(
        new Request("http://localhost/api/imports/transactions/bulk", {
          body: JSON.stringify({
            updates: [
              { category_id: "cat-travel", transaction_id: "tx-1" },
              { category_id: "cat-housing", transaction_id: "tx-2" },
            ],
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "PATCH",
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      failed: [
        {
          error: "Imported transaction was not found",
          transaction_id: "tx-2",
        },
      ],
      updated: [
        expect.objectContaining({
          category_id: "cat-travel",
          id: "tx-1",
        }),
      ],
    });
    expect(supabase.__state.transactions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_id: "cat-travel", id: "tx-1" }),
        expect.objectContaining({ category_id: null, id: "tx-2" }),
      ]),
    );
  });

  it("saves the anchor row, applies the new rule in-batch only, and skips drafted matches", async () => {
    const supabase = buildPhase2SupabaseStub({
      transactions: [
        makeTransaction("tx-1", { category_id: null, recipient: "PKP Intercity", title: "Rail ticket" }),
        makeTransaction("tx-2", { category_id: null, recipient: "PKP Intercity", title: "Rail ticket" }),
        makeTransaction("tx-3", { category_id: null, recipient: "PKP Intercity", title: "Rail ticket" }),
        makeTransaction("tx-4", { category_id: null, import_batch_id: "batch-2", recipient: "PKP Intercity" }),
      ],
    });

    const result = await createImportReviewRule(supabase as never, userId, {
      apply_now: true,
      category_id: "cat-travel",
      dirty_transaction_ids: ["tx-3"],
      match_field: "recipient",
      match_text: "PKP",
      transaction_id: "tx-1",
    });

    expect(result.anchor_transaction).toMatchObject({
      category_id: "cat-travel",
      categorized_by_rule_id: result.rule.id,
    });
    expect(result.applied_transactions).toEqual([
      expect.objectContaining({
        category_id: "cat-travel",
        categorized_by_rule_id: result.rule.id,
        id: "tx-2",
      }),
    ]);
    expect(result.match_count).toBe(2);
    expect(result.skipped_rows).toEqual([
      {
        reason: "dirty_draft",
        transaction_id: "tx-3",
      },
    ]);
    expect(supabase.__state.transactions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_id: "cat-travel", id: "tx-1" }),
        expect.objectContaining({ category_id: "cat-travel", id: "tx-2" }),
        expect.objectContaining({ category_id: null, id: "tx-3" }),
        expect.objectContaining({ category_id: null, id: "tx-4" }),
      ]),
    );
  });

  it("clears only successful drafts and merges only updated rows after a mixed save", () => {
    const drafts = {
      "tx-1": "cat-travel",
      "tx-2": "cat-housing",
    };

    const feedback = buildBulkSaveFeedback(drafts, {
      failed: [
        {
          error: "Imported transaction was not found",
          transaction_id: "tx-2",
        },
      ],
      updated: [
        {
          category_id: "cat-travel",
          id: "tx-1",
        },
      ],
    });

    expect(feedback).toEqual({
      drafts: {
        "tx-2": "cat-housing",
      },
      errorById: {
        "tx-2": "Imported transaction was not found",
      },
      successById: {
        "tx-1": "Category saved.",
      },
    });

    expect(
      mergeImportedTransactionCategoryUpdates(
        [makeTransaction("tx-1", { category_id: "cat-food" }), makeTransaction("tx-2", { category_id: null })],
        [
          {
            category_id: "cat-travel",
            id: "tx-1",
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({ category_id: "cat-travel", id: "tx-1" }),
      expect.objectContaining({ category_id: null, id: "tx-2" }),
    ]);

    expect(
      buildDirtyCategoryUpdates(
        [makeTransaction("tx-1", { category_id: "cat-food" }), makeTransaction("tx-2", { category_id: null })],
        feedback.drafts,
      ),
    ).toEqual([
      {
        category_id: "cat-housing",
        transaction_id: "tx-2",
      },
    ]);
  });

  it("returns review-rule payloads from the dedicated import-review route", async () => {
    const ruleRoute: typeof import("@/pages/api/imports/transactions/rule") =
      await import("@/pages/api/imports/transactions/rule");
    const supabase = buildPhase2SupabaseStub({
      transactions: [
        makeTransaction("tx-1", { category_id: null, recipient: "PKP Intercity", title: "Rail ticket" }),
        makeTransaction("tx-2", { category_id: null, recipient: "PKP Intercity", title: "Rail ticket" }),
      ],
    });

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await ruleRoute.POST(
      routeContext(
        new Request("http://localhost/api/imports/transactions/rule", {
          body: JSON.stringify({
            apply_now: false,
            category_id: "cat-travel",
            dirty_transaction_ids: [],
            match_field: "recipient",
            match_text: "PKP",
            transaction_id: "tx-1",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }),
      ),
    );

    expect(response.status).toBe(200);
    const payload = await readJson<{
      anchor_transaction: { category_id: string | null; categorized_by_rule_id: string | null };
      applied_transactions: { id: string }[];
      match_count: number;
    }>(response);

    expect(payload.anchor_transaction.category_id).toBe("cat-travel");
    expect(payload.anchor_transaction.categorized_by_rule_id).toEqual(expect.any(String));
    expect(payload.applied_transactions).toEqual([]);
    expect(payload.match_count).toBe(1);
  });
});

describe("review completion boundary truthfulness", () => {
  it("renders completion as blocked while dirty drafts remain and unblocked after reconciliation", () => {
    const blockedMarkup = renderToStaticMarkup(
      createElement(ReviewCompletionBar, {
        batch: makeBatch(),
        completionBlockedReason: "Save or discard unsaved review changes before marking this review complete.",
        isCompletionBlocked: true,
        onComplete: vi.fn(() => Promise.resolve()),
        transactionCount: 2,
      }),
    );

    const readyMarkup = renderToStaticMarkup(
      createElement(ReviewCompletionBar, {
        batch: makeBatch(),
        completionBlockedReason: null,
        isCompletionBlocked: false,
        onComplete: vi.fn(() => Promise.resolve()),
        transactionCount: 2,
      }),
    );

    expect(blockedMarkup).toContain("Save or discard unsaved review changes before marking this review complete.");
    expect(blockedMarkup).toContain("disabled");
    expect(readyMarkup).toContain("Mark review complete");
    expect(readyMarkup).not.toContain("Save or discard unsaved review changes before marking this review complete.");
  });

  it("marks a batch review complete through the helper and route contract", async () => {
    const completeRoute: typeof import("@/pages/api/imports/batches/[id]/complete") =
      await import("@/pages/api/imports/batches/[id]/complete");
    const supabase = buildPhase2SupabaseStub({
      batch: makeBatch({ id: "batch-phase-2" }),
    });

    const completedBatch = await markBatchReviewComplete(supabase as never, userId, "batch-phase-2");
    if (!completedBatch) {
      throw new Error("Expected markBatchReviewComplete to return the updated batch");
    }

    expect(completedBatch.review_completed_at).toEqual(expect.any(String));

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await completeRoute.POST(
      routeContext(
        new Request("http://localhost/api/imports/batches/batch-phase-2/complete", {
          method: "POST",
        }),
        { id: "batch-phase-2" },
      ),
    );

    expect(response.status).toBe(200);
    const completionPayload = await readJson<{ batch: ImportBatch }>(response);
    expect(completionPayload.batch.id).toBe("batch-phase-2");
    expect(completionPayload.batch.review_completed_at).toEqual(expect.any(String));
  });
});

describe("dashboard rule lifecycle and downstream mutation scope", () => {
  it("matches recipient, title, and both-field rules only when their saved field scope applies", () => {
    expect(
      ruleMatchesTransaction(
        {
          match_field: "recipient",
          match_text: "grocer",
        },
        {
          recipient: "Weekend Grocer",
          title: "Card payment",
        },
      ),
    ).toBe(true);

    expect(
      ruleMatchesTransaction(
        {
          match_field: "title",
          match_text: "rent",
        },
        {
          recipient: "ACME Utilities",
          title: "June rent invoice",
        },
      ),
    ).toBe(true);

    expect(
      ruleMatchesTransaction(
        {
          match_field: "both",
          match_text: "acme utility",
        },
        {
          recipient: "ACME Utility",
          title: "Monthly statement",
        },
      ),
    ).toBe(true);

    expect(
      ruleMatchesTransaction(
        {
          match_field: "both",
          match_text: "acme utility",
        },
        {
          recipient: "ACME Services",
          title: "Monthly statement",
        },
      ),
    ).toBe(false);
  });

  it("creates, updates, and deletes dashboard rules through the API", async () => {
    const rulesIndexRoute: typeof import("@/pages/api/rules/index") = await import("@/pages/api/rules/index");
    const rulesDetailRoute: typeof import("@/pages/api/rules/[id]") = await import("@/pages/api/rules/[id]");
    const supabase = buildPhase2SupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const createResponse = await rulesIndexRoute.POST(
      routeContext(
        new Request("http://localhost/api/rules", {
          body: JSON.stringify({
            match_field: "recipient",
            match_text: "Grocer",
            target_category_id: "cat-food",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }),
      ),
    );

    expect(createResponse.status).toBe(201);
    const createdPayload = await readJson<{ rule: CategorizationRule }>(createResponse);
    expect(createdPayload.rule).toMatchObject({
      match_field: "recipient",
      match_text: "Grocer",
      target_category_id: "cat-food",
    });

    const updateResponse = await rulesDetailRoute.PATCH(
      routeContext(
        new Request(`http://localhost/api/rules/${createdPayload.rule.id}`, {
          body: JSON.stringify({
            match_field: "title",
            match_text: "rent",
            target_category_id: "cat-housing",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "PATCH",
        }),
        { id: createdPayload.rule.id },
      ),
    );

    expect(updateResponse.status).toBe(200);
    const updatedPayload = await readJson<{ rule: CategorizationRule }>(updateResponse);
    expect(updatedPayload.rule).toEqual(
      expect.objectContaining({
        id: createdPayload.rule.id,
        match_field: "title",
        match_text: "rent",
        target_category_id: "cat-housing",
      }),
    );

    const deleteResponse = await rulesDetailRoute.DELETE(
      routeContext(
        new Request(`http://localhost/api/rules/${createdPayload.rule.id}`, {
          method: "DELETE",
        }),
        { id: createdPayload.rule.id },
      ),
    );

    expect(deleteResponse.status).toBe(200);
    expect(supabase.__state.rules()).toEqual([]);
  });

  it("applies created, updated, and deleted rules truthfully to future imports", async () => {
    const rulesIndexRoute: typeof import("@/pages/api/rules/index") = await import("@/pages/api/rules/index");
    const rulesDetailRoute: typeof import("@/pages/api/rules/[id]") = await import("@/pages/api/rules/[id]");
    const supabase = buildPhase2SupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const createResponse = await rulesIndexRoute.POST(
      routeContext(
        new Request("http://localhost/api/rules", {
          body: JSON.stringify({
            match_field: "recipient",
            match_text: "Grocer",
            target_category_id: "cat-food",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }),
      ),
    );
    const createdRule = (await readJson<{ rule: CategorizationRule }>(createResponse)).rule;

    const recipientImport = await commitImportBatch(supabase as never, userId, {
      bank: "revolut",
      confirm_replace: false,
      period_end: "2026-07-31",
      period_start: "2026-07-01",
      source_filename: "recipient.csv",
      statement_month: "2026-07-01",
      transactions: [
        {
          amount: -21.5,
          recipient: "Corner Grocer",
          title: "Card payment",
          transaction_date: "2026-07-04",
        },
        {
          amount: -99,
          recipient: "Different Merchant",
          title: "Monthly rent",
          transaction_date: "2026-07-06",
        },
      ],
    } satisfies ImportCommitPayload);

    expect(recipientImport.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_id: "cat-food", recipient: "Corner Grocer" }),
        expect.objectContaining({ category_id: null, recipient: "Different Merchant" }),
      ]),
    );

    await rulesDetailRoute.PATCH(
      routeContext(
        new Request(`http://localhost/api/rules/${createdRule.id}`, {
          body: JSON.stringify({
            match_field: "title",
            match_text: "rent",
            target_category_id: "cat-housing",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "PATCH",
        }),
        { id: createdRule.id },
      ),
    );

    const titleImport = await commitImportBatch(supabase as never, userId, {
      bank: "revolut",
      confirm_replace: false,
      period_end: "2026-08-31",
      period_start: "2026-08-01",
      source_filename: "title.csv",
      statement_month: "2026-08-01",
      transactions: [
        {
          amount: -1200,
          recipient: "Different Merchant",
          title: "August rent invoice",
          transaction_date: "2026-08-02",
        },
        {
          amount: -15,
          recipient: "Corner Grocer",
          title: "Card payment",
          transaction_date: "2026-08-03",
        },
      ],
    } satisfies ImportCommitPayload);

    expect(titleImport.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_id: "cat-housing", title: "August rent invoice" }),
        expect.objectContaining({ category_id: null, recipient: "Corner Grocer", title: "Card payment" }),
      ]),
    );

    const bothResponse = await rulesIndexRoute.POST(
      routeContext(
        new Request("http://localhost/api/rules", {
          body: JSON.stringify({
            match_field: "both",
            match_text: "acme utility",
            target_category_id: "cat-travel",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }),
      ),
    );
    const bothRule = (await readJson<{ rule: CategorizationRule }>(bothResponse)).rule;

    const bothImport = await commitImportBatch(supabase as never, userId, {
      bank: "revolut",
      confirm_replace: false,
      period_end: "2026-09-30",
      period_start: "2026-09-01",
      source_filename: "both.csv",
      statement_month: "2026-09-01",
      transactions: [
        {
          amount: -55,
          recipient: "ACME Utility",
          title: "Monthly statement",
          transaction_date: "2026-09-04",
        },
        {
          amount: -55,
          recipient: "ACME Services",
          title: "Monthly statement",
          transaction_date: "2026-09-05",
        },
      ],
    } satisfies ImportCommitPayload);

    expect(bothImport.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_id: "cat-travel", recipient: "ACME Utility" }),
        expect.objectContaining({ category_id: null, recipient: "ACME Services" }),
      ]),
    );

    await rulesDetailRoute.DELETE(
      routeContext(
        new Request(`http://localhost/api/rules/${bothRule.id}`, {
          method: "DELETE",
        }),
        { id: bothRule.id },
      ),
    );

    const deletedImport = await commitImportBatch(supabase as never, userId, {
      bank: "revolut",
      confirm_replace: false,
      period_end: "2026-10-31",
      period_start: "2026-10-01",
      source_filename: "deleted.csv",
      statement_month: "2026-10-01",
      transactions: [
        {
          amount: -44,
          recipient: "ACME Utility",
          title: "Monthly statement",
          transaction_date: "2026-10-03",
        },
      ],
    } satisfies ImportCommitPayload);

    expect(deletedImport.transactions).toEqual([
      expect.objectContaining({ category_id: null, recipient: "ACME Utility" }),
    ]);
  });
});
