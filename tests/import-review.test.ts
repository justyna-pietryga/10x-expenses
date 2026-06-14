import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ImportHistory } from "@/components/imports/ImportHistory";
import { ImportUploadForm } from "@/components/imports/ImportUploadForm";
import {
  buildImportHistorySummary,
  buildImportWorkspaceUrl,
  createImportReviewRule,
  findDefaultImportHistoryBatchId,
  ImportWorkspace,
  loadImportBatchReviewFromApi,
  mergeImportedTransactions,
  mergeImportedTransactionCategoryUpdates,
  reconcileImportHistory,
  saveImportCategoryChanges,
} from "@/components/imports/ImportWorkspace";
import { ReviewCompletionBar } from "@/components/imports/ReviewCompletionBar";
import {
  buildInitialReviewRuleDraft,
  buildBulkSaveFeedback,
  buildDirtyCategoryUpdates,
  buildReviewRulePreview,
  TransactionReviewTable,
} from "@/components/imports/TransactionReviewTable";
import type { BudgetCategory } from "@/lib/budget/data";
import {
  validateImportCategoryUpdatesPayload,
  validateImportCommitPayload,
  validateImportReviewRulePayload,
  validateSupportedBank,
} from "@/lib/imports/validation";
import { createClient } from "@/lib/supabase";
import {
  commitImportBatch,
  listImportBatchHistory,
  loadDefaultImportBatchReview,
  markBatchReviewComplete,
  type ImportedTransaction,
  updateImportTransactionCategories,
  updateTransactionCategoryAndMaybeRule,
} from "@/lib/imports/data";
import type { Database } from "@/lib/database.types";
import { parseIngCsv } from "@/lib/imports/ingCsv";
import { parseRevolutCsv } from "@/lib/imports/revolutCsv";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

const reviewCategories: BudgetCategory[] = [
  {
    archived_at: null,
    carryover_enabled: false,
    created_at: "2026-05-01T00:00:00.000Z",
    id: "cat-food",
    name: "Food",
    percentage_limit: 30,
    updated_at: "2026-05-01T00:00:00.000Z",
    user_id: "user-1",
  },
  {
    archived_at: null,
    carryover_enabled: true,
    created_at: "2026-05-01T00:00:00.000Z",
    id: "cat-travel",
    name: "Travel",
    percentage_limit: 20,
    updated_at: "2026-05-01T00:00:00.000Z",
    user_id: "user-1",
  },
];

const reviewTransactions: ImportedTransaction[] = [
  {
    amount: -12.34,
    category_id: "cat-food",
    categorized_by_rule_id: null,
    created_at: "2026-05-30T08:00:00.000Z",
    id: "tx-1",
    import_batch_id: "batch-1",
    recipient: "Lidl Warszawa",
    title: "Lidl Warszawa",
    transaction_date: "2026-05-03",
    updated_at: "2026-05-30T08:00:00.000Z",
    user_id: "user-1",
  },
  {
    amount: -64.2,
    category_id: null,
    categorized_by_rule_id: null,
    created_at: "2026-05-30T08:00:00.000Z",
    id: "tx-2",
    import_batch_id: "batch-1",
    recipient: "PKP Intercity",
    title: "PKP Intercity",
    transaction_date: "2026-05-11",
    updated_at: "2026-05-30T08:00:00.000Z",
    user_id: "user-1",
  },
];

const reviewBatchHistory = [
  {
    bank: "revolut" as const,
    id: "batch-pending-latest-import",
    imported_at: "2026-06-12T10:00:00.000Z",
    review_completed_at: null,
    source_filename: "pending-latest.csv",
    statement_month: "2026-05-01",
    transaction_count: 2,
  },
  {
    bank: "ing" as const,
    id: "batch-complete-newer-month",
    imported_at: "2026-06-13T10:00:00.000Z",
    review_completed_at: "2026-06-13T12:00:00.000Z",
    source_filename: "completed-newer.csv",
    statement_month: "2026-06-01",
    transaction_count: 1,
  },
];

function createSelectChain(data: unknown, error: { code?: string; message: string } | null = null) {
  return {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

function createInsertSingleChain(data: unknown, error: { code?: string; message: string } | null = null) {
  return {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

function createInsertManyChain(data: unknown, error: { code?: string; message: string } | null = null) {
  return {
    select: vi.fn().mockResolvedValue({ data, error }),
  };
}

function createUpdateSingleChain(data: unknown, error: { code?: string; message: string } | null = null) {
  return {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

function buildImportSupabaseStub(options?: {
  bank?: "revolut" | "ing";
  completeBatchUpdate?: boolean;
  existingBatch?: boolean;
  failReplacementInsert?: boolean;
}) {
  const bank = options?.bank ?? "revolut";
  const existingBatch = options?.existingBatch
    ? {
        id: "batch-existing",
        bank,
        user_id: "user-1",
        statement_month: "2026-05-01",
        period_start: "2026-05-01",
        period_end: "2026-05-31",
        source_filename: "old.csv",
        imported_at: "2026-05-01T08:00:00.000Z",
        review_completed_at: null,
        created_at: "2026-05-01T08:00:00.000Z",
        updated_at: "2026-05-01T08:00:00.000Z",
      }
    : null;
  const createdBatch = {
    id: "batch-1",
    bank,
    user_id: "user-1",
    statement_month: "2026-05-01",
    period_start: "2026-05-03",
    period_end: "2026-05-28",
    source_filename: `${bank}.csv`,
    imported_at: "2026-05-30T08:00:00.000Z",
    review_completed_at: null,
    created_at: "2026-05-30T08:00:00.000Z",
    updated_at: "2026-05-30T08:00:00.000Z",
  };
  const updatedBatch = {
    ...createdBatch,
    id: "batch-existing",
  };
  const completedBatch = {
    ...updatedBatch,
    review_completed_at: "2026-05-30T09:00:00.000Z",
  };
  const insertedTransactions = [
    {
      id: "tx-1",
      amount: -12.34,
      category_id: "cat-food",
      categorized_by_rule_id: "rule-food",
      created_at: "2026-05-30T08:00:00.000Z",
      import_batch_id: options?.existingBatch ? "batch-existing" : "batch-1",
      recipient: "Lidl Warszawa",
      title: "Lidl Warszawa",
      transaction_date: "2026-05-03",
      updated_at: "2026-05-30T08:00:00.000Z",
      user_id: "user-1",
    },
  ];
  const existingTransactions: ImportedTransaction[] = options?.existingBatch
    ? [
        {
          id: "tx-existing-1",
          amount: -88.12,
          category_id: "cat-food",
          categorized_by_rule_id: null,
          created_at: "2026-05-01T08:00:00.000Z",
          import_batch_id: "batch-existing",
          recipient: "Old Merchant",
          title: "Old Merchant",
          transaction_date: "2026-05-04",
          updated_at: "2026-05-01T08:00:00.000Z",
          user_id: "user-1",
        },
      ]
    : [];
  const updatedTransaction = {
    ...insertedTransactions[0],
    category_id: "cat-travel",
    categorized_by_rule_id: null,
  };
  const createdRule = {
    id: "rule-1",
    match_field: "recipient",
    match_text: "Lidl Warszawa",
    target_category_id: "cat-travel",
    created_at: "2026-05-30T08:00:00.000Z",
    updated_at: "2026-05-30T08:00:00.000Z",
    user_id: "user-1",
  };
  let batchTransactions: ImportedTransaction[] = options?.existingBatch ? [...existingTransactions] : [];
  let insertCallCount = 0;

  return {
    __getBatchTransactions() {
      return batchTransactions;
    },
    from: vi.fn((table: string) => {
      if (table === "statement_import_batches") {
        return {
          select: vi.fn().mockReturnValue(createSelectChain(existingBatch)),
          insert: vi.fn().mockReturnValue(createInsertSingleChain(createdBatch)),
          update: vi
            .fn()
            .mockReturnValue(createUpdateSingleChain(options?.completeBatchUpdate ? completedBatch : updatedBatch)),
        };
      }

      if (table === "categorization_rules") {
        return {
          select: vi.fn().mockReturnValue(
            createSelectChain([
              {
                id: "rule-food",
                match_field: "both",
                match_text: "Lidl",
                target_category_id: "cat-food",
                created_at: "2026-05-01T00:00:00.000Z",
                updated_at: "2026-05-01T00:00:00.000Z",
                user_id: "user-1",
              },
            ]),
          ),
          upsert: vi.fn().mockReturnValue(createInsertSingleChain(createdRule)),
        };
      }

      if (table === "transactions") {
        return {
          delete: vi.fn(() => {
            const filters = new Map<string, string>();
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                filters.set(field, value);

                if (field === "user_id") {
                  const importBatchId = filters.get("import_batch_id");

                  if (importBatchId) {
                    batchTransactions = batchTransactions.filter(
                      (transaction) => transaction.import_batch_id !== importBatchId || transaction.user_id !== value,
                    );
                  }
                }

                return chain;
              }),
              then(resolve: (value: { error: null }) => unknown) {
                resolve({ error: null });
              },
            };

            return chain;
          }),
          insert: vi.fn((rows: Database["public"]["Tables"]["transactions"]["Insert"][]) => {
            insertCallCount += 1;

            if (options?.failReplacementInsert && options.existingBatch && insertCallCount === 1) {
              return createInsertManyChain(null, {
                code: "23505",
                message: "replacement insert failed",
              });
            }

            const inserted: ImportedTransaction[] = rows.map((row, index) => ({
              ...row,
              amount: row.amount,
              category_id: row.category_id ?? null,
              categorized_by_rule_id: row.categorized_by_rule_id ?? null,
              created_at: row.created_at ?? "2026-05-30T08:00:00.000Z",
              id: row.id ?? `tx-restored-${index + 1}`,
              import_batch_id: row.import_batch_id,
              recipient: row.recipient,
              title: row.title,
              transaction_date: row.transaction_date,
              updated_at: row.updated_at ?? "2026-05-30T08:00:00.000Z",
              user_id: row.user_id,
            }));
            batchTransactions = inserted;

            return createInsertManyChain(inserted);
          }),
          select: vi.fn().mockImplementation(() => {
            const filters = new Map<string, string>();
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                filters.set(field, value);
                return chain;
              }),
              order: vi.fn().mockImplementation(() =>
                Promise.resolve({
                  data: batchTransactions.filter((transaction) => {
                    const importBatchId = filters.get("import_batch_id");
                    const userId = filters.get("user_id");

                    return (
                      (!importBatchId || transaction.import_batch_id === importBatchId) &&
                      (!userId || transaction.user_id === userId)
                    );
                  }),
                  error: null,
                }),
              ),
            };

            return chain;
          }),
          update: vi.fn().mockReturnValue(createUpdateSingleChain(updatedTransaction)),
        };
      }

      if (table === "budget_categories") {
        return {
          select: vi.fn().mockReturnValue(
            createSelectChain([
              {
                id: "cat-food",
                user_id: "user-1",
                name: "Food",
                percentage_limit: 30,
                carryover_enabled: false,
                archived_at: null,
                created_at: "2026-05-01T00:00:00.000Z",
                updated_at: "2026-05-01T00:00:00.000Z",
              },
              {
                id: "cat-travel",
                user_id: "user-1",
                name: "Travel",
                percentage_limit: 20,
                carryover_enabled: true,
                archived_at: null,
                created_at: "2026-05-01T00:00:00.000Z",
                updated_at: "2026-05-01T00:00:00.000Z",
              },
            ]),
          ),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function buildBulkImportSupabaseStub(options?: {
  categories?: { archived_at: string | null; id: string; name: string; user_id: string }[];
  transactions?: Record<string, { category_id: string | null; id: string; user_id: string }>;
}) {
  const categories = options?.categories ?? [
    {
      archived_at: null,
      id: "cat-food",
      name: "Food",
      user_id: "user-1",
    },
    {
      archived_at: null,
      id: "cat-travel",
      name: "Travel",
      user_id: "user-1",
    },
  ];
  const transactions = options?.transactions ?? {
    "tx-empty": {
      category_id: null,
      id: "tx-empty",
      user_id: "user-1",
    },
    "tx-food": {
      category_id: "cat-food",
      id: "tx-food",
      user_id: "user-1",
    },
  };
  const transactionUpdates: unknown[] = [];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "budget_categories") {
        return {
          select: vi.fn().mockReturnValue(createSelectChain(categories)),
        };
      }

      if (table === "transactions") {
        return {
          update: vi.fn((values: { category_id: string | null }) => {
            transactionUpdates.push(values);
            const filters = new Map<string, string>();
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                filters.set(field, value);
                return chain;
              }),
              select: vi.fn(() => chain),
              single: vi.fn(() => {
                const transactionId = filters.get("id");
                const userId = filters.get("user_id");
                const transaction = transactionId ? transactions[transactionId] : null;

                if (!transaction || transaction.user_id !== userId) {
                  return {
                    data: null,
                    error: {
                      code: "PGRST116",
                      message: "not found",
                    },
                  };
                }

                return {
                  data: {
                    ...transaction,
                    category_id: values.category_id,
                  },
                  error: null,
                };
              }),
            };

            return chain;
          }),
        };
      }

      if (table === "categorization_rules") {
        throw new Error("Bulk category updates must not touch categorization rules");
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return {
    supabase,
    transactionUpdates,
  };
}

function buildImportHistorySupabaseStub(options?: {
  batches?: {
    bank: "revolut" | "ing";
    id: string;
    imported_at: string;
    review_completed_at: string | null;
    source_filename: string | null;
    statement_month: string;
    user_id: string;
  }[];
  rules?: {
    id: string;
    match_field: "recipient" | "title" | "both";
    match_text: string;
    target_category_id: string;
    user_id: string;
  }[];
  transactions?: ImportedTransaction[];
}) {
  const batches = options?.batches ?? [
    {
      bank: "revolut" as const,
      id: "batch-pending-latest-import",
      imported_at: "2026-06-12T10:00:00.000Z",
      review_completed_at: null,
      source_filename: "pending-latest.csv",
      statement_month: "2026-05-01",
      user_id: "user-1",
    },
    {
      bank: "revolut" as const,
      id: "batch-complete-newer-month",
      imported_at: "2026-06-13T10:00:00.000Z",
      review_completed_at: "2026-06-13T12:00:00.000Z",
      source_filename: "completed-newer.csv",
      statement_month: "2026-06-01",
      user_id: "user-1",
    },
    {
      bank: "ing" as const,
      id: "batch-pending-same-month-older-import",
      imported_at: "2026-06-10T10:00:00.000Z",
      review_completed_at: null,
      source_filename: "pending-older.csv",
      statement_month: "2026-05-01",
      user_id: "user-1",
    },
  ];
  const transactions = options?.transactions ?? [
    {
      amount: -12.34,
      category_id: null,
      categorized_by_rule_id: null,
      created_at: "2026-06-12T10:00:00.000Z",
      id: "tx-history-1",
      import_batch_id: "batch-pending-latest-import",
      recipient: "Merchant A",
      title: "Merchant A",
      transaction_date: "2026-05-03",
      updated_at: "2026-06-12T10:00:00.000Z",
      user_id: "user-1",
    },
    {
      amount: -6.5,
      category_id: null,
      categorized_by_rule_id: null,
      created_at: "2026-06-12T10:00:00.000Z",
      id: "tx-history-2",
      import_batch_id: "batch-pending-latest-import",
      recipient: "Merchant B",
      title: "Merchant B",
      transaction_date: "2026-05-05",
      updated_at: "2026-06-12T10:00:00.000Z",
      user_id: "user-1",
    },
    {
      amount: -18,
      category_id: null,
      categorized_by_rule_id: null,
      created_at: "2026-06-10T10:00:00.000Z",
      id: "tx-history-3",
      import_batch_id: "batch-pending-same-month-older-import",
      recipient: "Merchant C",
      title: "Merchant C",
      transaction_date: "2026-05-08",
      updated_at: "2026-06-10T10:00:00.000Z",
      user_id: "user-1",
    },
    {
      amount: -40,
      category_id: null,
      categorized_by_rule_id: null,
      created_at: "2026-06-13T10:00:00.000Z",
      id: "tx-history-4",
      import_batch_id: "batch-complete-newer-month",
      recipient: "Merchant D",
      title: "Merchant D",
      transaction_date: "2026-06-02",
      updated_at: "2026-06-13T10:00:00.000Z",
      user_id: "user-1",
    },
  ];
  const rules = options?.rules ?? [
    {
      id: "rule-food",
      match_field: "both" as const,
      match_text: "Lidl",
      target_category_id: "cat-food",
      user_id: "user-1",
    },
  ];

  return {
    from: vi.fn((table: string) => {
      if (table === "statement_import_batches") {
        return {
          select: vi.fn(() => {
            let idFilter: string | null = null;
            let userFilter: string | null = null;
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                if (field === "id") {
                  idFilter = value;
                }

                if (field === "user_id") {
                  userFilter = value;
                }

                return chain;
              }),
              order: vi.fn(() =>
                Promise.resolve({
                  data: batches.filter(
                    (batch) => (!idFilter || batch.id === idFilter) && (!userFilter || batch.user_id === userFilter),
                  ),
                  error: null,
                }),
              ),
              single: vi.fn(() => {
                const batch =
                  batches.find(
                    (item) => (!idFilter || item.id === idFilter) && (!userFilter || item.user_id === userFilter),
                  ) ?? null;

                return Promise.resolve(
                  batch
                    ? { data: batch, error: null }
                    : { data: null, error: { code: "PGRST116", message: "not found" } },
                );
              }),
            };

            return chain;
          }),
        };
      }

      if (table === "transactions") {
        return {
          select: vi.fn(() => {
            let batchFilter: string | null = null;
            let userFilter: string | null = null;
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                if (field === "import_batch_id") {
                  batchFilter = value;
                }

                if (field === "user_id") {
                  userFilter = value;
                }

                return chain;
              }),
              order: vi.fn(() =>
                Promise.resolve({
                  data: transactions.filter(
                    (transaction) =>
                      (!batchFilter || transaction.import_batch_id === batchFilter) &&
                      (!userFilter || transaction.user_id === userFilter),
                  ),
                  error: null,
                }),
              ),
            };

            return chain;
          }),
        };
      }

      if (table === "categorization_rules") {
        return {
          select: vi.fn(() => {
            let userFilter: string | null = null;
            const chain = {
              eq: vi.fn((field: string, value: string) => {
                if (field === "user_id") {
                  userFilter = value;
                }

                return chain;
              }),
              order: vi.fn(() =>
                Promise.resolve({
                  data: rules.filter((rule) => !userFilter || rule.user_id === userFilter),
                  error: null,
                }),
              ),
            };

            return chain;
          }),
        };
      }

      if (table === "budget_categories") {
        return {
          select: vi.fn().mockReturnValue(createSelectChain(reviewCategories)),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

const validRevolutCsv = readFileSync(
  resolve(process.cwd(), "context/foundation/resources/revolut-statement-example.csv"),
  "utf8",
);
const validIngCsv = readFileSync(
  resolve(process.cwd(), "context/foundation/resources/ing-statement-example.csv"),
  "utf8",
);

describe("revolut csv parser", () => {
  it("parses a supported Revolut CSV and derives one monthly batch", () => {
    const parsed = parseRevolutCsv(validRevolutCsv);

    expect(parsed.period_end).toBe("2026-05-29");
    expect(parsed.period_start).toBe("2026-05-01");
    expect(parsed.statement_month).toBe("2026-05-01");
    expect(parsed.transactions[0]).toMatchObject({
      amount: -36.97,
      recipient: "ROSSMANN",
      title: "Płatność kartą",
      transaction_date: "2026-05-01",
    });
    expect(parsed.transactions).toContainEqual({
      amount: -151.45,
      recipient: "Espresso House",
      title: "Płatność kartą",
      transaction_date: "2026-05-04",
    });
    expect(parsed.transactions.some((transaction) => transaction.recipient === "Uber")).toBe(false);
    expect(
      parsed.transactions.some(
        (transaction) => transaction.recipient === "Good Lood" && transaction.transaction_date === "2026-05-29",
      ),
    ).toBe(false);
  });

  it("rejects an unsupported header", () => {
    const invalidHeaderCsv = validRevolutCsv.replace("Rodzaj,Produkt", "Kind,Produkt");

    expect(() => parseRevolutCsv(invalidHeaderCsv)).toThrow(/Unsupported Revolut CSV header/);
  });

  it("fails when the CSV spans more than one month", () => {
    const multiMonthCsv = `Rodzaj,Produkt,Data rozpoczęcia,Data zrealizowania,Opis,Kwota,Opłata,Waluta,State,Saldo
Płatność kartą,Bieżące,2026-05-31 10:00:00,2026-05-31 10:00:00,Lidl,-12.34,0.00,PLN,ZAKOŃCZONO,100.00
Płatność kartą,Bieżące,2026-06-01 10:00:00,2026-06-01 10:00:00,June purchase,-5.00,0.00,PLN,ZAKOŃCZONO,95.00
`;

    expect(() => parseRevolutCsv(multiMonthCsv)).toThrow(/exactly one calendar month/);
  });

  it("rejects files that do not contain any completed transactions", () => {
    const noCompletedCsv = `Rodzaj,Produkt,Data rozpoczęcia,Data zrealizowania,Opis,Kwota,Opłata,Waluta,State,Saldo
Płatność kartą,Bieżące,2026-05-29 12:46:56,,Piekarnia,-23.45,0.00,PLN,OCZEKUJE,
Płatność kartą,Bieżące,2026-05-27 22:55:31,,Uber,-19.94,0.00,PLN,COFNIĘTO,
`;

    expect(() => parseRevolutCsv(noCompletedCsv)).toThrow(/at least one completed transaction/);
  });
});

describe("import validation", () => {
  it("accepts both supported banks in the shared import contract", () => {
    expect(validateSupportedBank("revolut")).toBe("revolut");
    expect(validateSupportedBank("ing")).toBe("ing");
  });

  it("rejects unsupported banks", () => {
    expect(() => validateSupportedBank("mbank")).toThrow(/Only Revolut and ING CSV imports are supported/);
  });

  it("accepts commit payloads for ING", () => {
    const payload = validateImportCommitPayload({
      bank: "ing",
      confirm_replace: false,
      period_end: "2026-05-31",
      period_start: "2026-05-01",
      source_filename: "ing.csv",
      statement_month: "2026-05-01",
      transactions: [
        {
          amount: -12.34,
          recipient: "ING recipient",
          title: "Card payment",
          transaction_date: "2026-05-03",
        },
      ],
    });

    expect(payload.bank).toBe("ing");
  });

  it("accepts bulk category update payloads", () => {
    expect(
      validateImportCategoryUpdatesPayload({
        updates: [
          {
            category_id: "cat-food",
            transaction_id: "tx-1",
          },
          {
            category_id: null,
            transaction_id: "tx-2",
          },
        ],
      }),
    ).toEqual({
      updates: [
        {
          category_id: "cat-food",
          transaction_id: "tx-1",
        },
        {
          category_id: null,
          transaction_id: "tx-2",
        },
      ],
    });
  });

  it("rejects empty bulk category update payloads", () => {
    expect(() =>
      validateImportCategoryUpdatesPayload({
        updates: [],
      }),
    ).toThrow(/updates must contain at least one/);
  });

  it("rejects rule creation flags in bulk category update payloads", () => {
    expect(() =>
      validateImportCategoryUpdatesPayload({
        save_rule: true,
        updates: [
          {
            category_id: "cat-food",
            transaction_id: "tx-1",
          },
        ],
      }),
    ).toThrow(/cannot create rules/);

    expect(() =>
      validateImportCategoryUpdatesPayload({
        updates: [
          {
            category_id: "cat-food",
            save_rule: true,
            transaction_id: "tx-1",
          },
        ],
      }),
    ).toThrow(/cannot create rules/);
  });

  it("accepts review rule payloads with explicit field choice and dirty-row protection", () => {
    expect(
      validateImportReviewRulePayload({
        apply_now: true,
        category_id: "cat-food",
        dirty_transaction_ids: ["tx-2", "tx-3"],
        match_field: "title",
        match_text: "rail ticket",
        transaction_id: "tx-1",
      }),
    ).toEqual({
      apply_now: true,
      category_id: "cat-food",
      dirty_transaction_ids: ["tx-2", "tx-3"],
      match_field: "title",
      match_text: "rail ticket",
      transaction_id: "tx-1",
    });
  });
});

describe("ing csv parser", () => {
  it("parses the supported ING CSV and derives one monthly batch", () => {
    const parsed = parseIngCsv(validIngCsv);

    expect(parsed.period_end).toBe("2026-05-30");
    expect(parsed.period_start).toBe("2026-05-16");
    expect(parsed.statement_month).toBe("2026-05-01");
    expect(parsed.transactions[0]).toMatchObject({
      amount: -10,
      recipient: "sts.pl ul. Porcelanowa 8 KATOWICE",
      title: "TR.BLIK",
      transaction_date: "2026-05-30",
    });
    expect(parsed.transactions[1]).toMatchObject({
      amount: -6000,
      recipient: "Revolut**7362*  Dublin D02 R296 IRL",
      transaction_date: "2026-05-30",
    });
    expect(parsed.transactions[1]?.title).toContain("30.05.2026");
    expect(parsed.transactions.some((transaction) => transaction.recipient.includes("KONTO Komfort"))).toBe(false);
  });

  it("rejects an unsupported ING header", () => {
    const invalidHeaderCsv = validIngCsv.replace('"Data transakcji";"Data ksi', '"Date";"Posted date ksi');

    expect(() => parseIngCsv(invalidHeaderCsv)).toThrow(/Unsupported ING CSV header/);
  });

  it("fails when effective transaction dates span more than one month", () => {
    const multiMonthCsv = `"Lista transakcji"
"Data transakcji";"Data księgowania";"Dane kontrahenta";"Tytuł";"Nr rachunku";"Nazwa banku";"Szczegóły";"Nr transakcji";"Kwota transakcji (waluta rachunku)";"Waluta";"Kwota blokady/zwolnienie blokady";"Waluta";"Kwota płatności w walucie";"Waluta";"Konto"
2026-05-31;2026-05-31;"Merchant one";"Card payment";;;"TR.KART";"1";-12,34;PLN;;;;;"KONTO Komfort"
2026-06-01;;"Merchant two";"Card payment";;;"TR.KART";"2";-5,67;PLN;;;;;"KONTO Komfort"
`;

    expect(() => parseIngCsv(multiMonthCsv)).toThrow(/exactly one calendar month/);
  });
});

describe("import data helpers", () => {
  it("requires explicit confirmation before replacing an existing bank-month batch", async () => {
    const supabase = buildImportSupabaseStub({ existingBatch: true });

    await expect(
      commitImportBatch(supabase as never, "user-1", {
        bank: "revolut",
        confirm_replace: false,
        period_end: "2026-05-28",
        period_start: "2026-05-03",
        source_filename: "revolut.csv",
        statement_month: "2026-05-01",
        transactions: [
          {
            amount: -12.34,
            recipient: "Lidl Warszawa",
            title: "Lidl Warszawa",
            transaction_date: "2026-05-03",
          },
        ],
      }),
    ).rejects.toThrow(/Replacement confirmation is required/);
  });

  it("creates a batch with review pending and applies existing rules", async () => {
    const supabase = buildImportSupabaseStub();

    await expect(
      commitImportBatch(supabase as never, "user-1", {
        bank: "revolut",
        confirm_replace: false,
        period_end: "2026-05-28",
        period_start: "2026-05-03",
        source_filename: "revolut.csv",
        statement_month: "2026-05-01",
        transactions: [
          {
            amount: -12.34,
            recipient: "Lidl Warszawa",
            title: "Lidl Warszawa",
            transaction_date: "2026-05-03",
          },
        ],
      }),
    ).resolves.toMatchObject({
      batch: {
        review_completed_at: null,
        statement_month: "2026-05-01",
      },
      transactions: [
        {
          category_id: "cat-food",
        },
      ],
    });
  });

  it("restores the previous month state when replacement transaction persistence fails", async () => {
    const supabase = buildImportSupabaseStub({ existingBatch: true, failReplacementInsert: true });

    await expect(
      commitImportBatch(supabase as never, "user-1", {
        bank: "revolut",
        confirm_replace: true,
        period_end: "2026-05-28",
        period_start: "2026-05-03",
        source_filename: "revolut.csv",
        statement_month: "2026-05-01",
        transactions: [
          {
            amount: -12.34,
            recipient: "Lidl Warszawa",
            title: "Lidl Warszawa",
            transaction_date: "2026-05-03",
          },
        ],
      }),
    ).rejects.toThrow(/replacement insert failed/);

    expect(supabase.__getBatchTransactions()).toMatchObject([
      {
        id: "tx-existing-1",
        import_batch_id: "batch-existing",
        recipient: "Old Merchant",
      },
    ]);
  });

  it("creates an ING batch with the shared persistence flow", async () => {
    const supabase = buildImportSupabaseStub({ bank: "ing" });

    await expect(
      commitImportBatch(supabase as never, "user-1", {
        bank: "ing",
        confirm_replace: false,
        period_end: "2026-05-30",
        period_start: "2026-05-16",
        source_filename: "ing.csv",
        statement_month: "2026-05-01",
        transactions: [
          {
            amount: -59.94,
            recipient: "Lidl Warszawa",
            title: "TR.KART",
            transaction_date: "2026-05-28",
          },
        ],
      }),
    ).resolves.toMatchObject({
      batch: {
        bank: "ing",
        review_completed_at: null,
        statement_month: "2026-05-01",
      },
      transactions: [
        {
          category_id: "cat-food",
        },
      ],
    });
  });

  it("requires explicit confirmation before replacing an existing ING bank-month batch", async () => {
    const supabase = buildImportSupabaseStub({ bank: "ing", existingBatch: true });

    await expect(
      commitImportBatch(supabase as never, "user-1", {
        bank: "ing",
        confirm_replace: false,
        period_end: "2026-05-30",
        period_start: "2026-05-16",
        source_filename: "ing.csv",
        statement_month: "2026-05-01",
        transactions: [
          {
            amount: -59.94,
            recipient: "Lidl Warszawa",
            title: "TR.KART",
            transaction_date: "2026-05-28",
          },
        ],
      }),
    ).rejects.toThrow(/Replacement confirmation is required/);
  });

  it("updates a transaction category and saves a reusable rule when requested", async () => {
    const supabase = buildImportSupabaseStub();

    await expect(
      updateTransactionCategoryAndMaybeRule(supabase as never, "user-1", "tx-1", "cat-travel", {
        saveRule: true,
      }),
    ).resolves.toMatchObject({
      rule: {
        match_field: "recipient",
        match_text: "Lidl Warszawa",
        target_category_id: "cat-travel",
      },
      transaction: {
        category_id: "cat-travel",
      },
    });
  });

  it("updates multiple imported transaction categories without creating rules", async () => {
    const { supabase, transactionUpdates } = buildBulkImportSupabaseStub();

    await expect(
      updateImportTransactionCategories(supabase as never, "user-1", [
        {
          category_id: "cat-travel",
          transaction_id: "tx-food",
        },
        {
          category_id: "cat-food",
          transaction_id: "tx-empty",
        },
      ]),
    ).resolves.toMatchObject({
      failed: [],
      updated: [
        {
          category_id: "cat-travel",
          id: "tx-food",
        },
        {
          category_id: "cat-food",
          id: "tx-empty",
        },
      ],
    });
    expect(transactionUpdates).toEqual([
      { categorized_by_rule_id: null, category_id: "cat-travel" },
      { categorized_by_rule_id: null, category_id: "cat-food" },
    ]);
  });

  it("allows bulk updates to clear a category", async () => {
    const { supabase } = buildBulkImportSupabaseStub();

    await expect(
      updateImportTransactionCategories(supabase as never, "user-1", [
        {
          category_id: null,
          transaction_id: "tx-food",
        },
      ]),
    ).resolves.toMatchObject({
      failed: [],
      updated: [
        {
          category_id: null,
          id: "tx-food",
        },
      ],
    });
  });

  it("returns mixed bulk category update results when one row fails", async () => {
    const { supabase } = buildBulkImportSupabaseStub();

    await expect(
      updateImportTransactionCategories(supabase as never, "user-1", [
        {
          category_id: "cat-travel",
          transaction_id: "tx-food",
        },
        {
          category_id: "cat-travel",
          transaction_id: "tx-missing",
        },
        {
          category_id: "cat-unknown",
          transaction_id: "tx-empty",
        },
      ]),
    ).resolves.toMatchObject({
      failed: [
        {
          error: "Imported transaction was not found",
          transaction_id: "tx-missing",
        },
        {
          error: "Selected category was not found",
          transaction_id: "tx-empty",
        },
      ],
      updated: [
        {
          category_id: "cat-travel",
          id: "tx-food",
        },
      ],
    });
  });

  it("does not bulk update transactions owned by another user", async () => {
    const { supabase } = buildBulkImportSupabaseStub({
      transactions: {
        "tx-other-user": {
          category_id: "cat-food",
          id: "tx-other-user",
          user_id: "user-2",
        },
      },
    });

    await expect(
      updateImportTransactionCategories(supabase as never, "user-1", [
        {
          category_id: "cat-travel",
          transaction_id: "tx-other-user",
        },
      ]),
    ).resolves.toMatchObject({
      failed: [
        {
          error: "Imported transaction was not found",
          transaction_id: "tx-other-user",
        },
      ],
      updated: [],
    });
  });

  it("marks a batch review as complete", async () => {
    const supabase = buildImportSupabaseStub({ completeBatchUpdate: true });

    const batch = await markBatchReviewComplete(supabase as never, "user-1", "batch-1");

    if (!batch) {
      throw new Error("Expected batch to be returned");
    }

    expect(batch.id).toBe("batch-existing");
    expect(batch.review_completed_at).toEqual(expect.any(String));
  });

  it("lists import history with pending batches first, deterministic ordering, and transaction counts", async () => {
    const supabase = buildImportHistorySupabaseStub();

    await expect(listImportBatchHistory(supabase as never, "user-1")).resolves.toEqual([
      expect.objectContaining({
        id: "batch-pending-latest-import",
        review_completed_at: null,
        statement_month: "2026-05-01",
        transaction_count: 2,
      }),
      expect.objectContaining({
        id: "batch-pending-same-month-older-import",
        review_completed_at: null,
        statement_month: "2026-05-01",
        transaction_count: 1,
      }),
      expect.objectContaining({
        id: "batch-complete-newer-month",
        review_completed_at: "2026-06-13T12:00:00.000Z",
        statement_month: "2026-06-01",
        transaction_count: 1,
      }),
    ]);
  });

  it("caps history at 50 rows", async () => {
    const batches = Array.from({ length: 55 }, (_, index) => ({
      bank: "revolut" as const,
      id: `batch-${index + 1}`,
      imported_at: `2026-06-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
      review_completed_at: null,
      source_filename: `statement-${index + 1}.csv`,
      statement_month: `2026-${String((index % 12) + 1).padStart(2, "0")}-01`,
      user_id: "user-1",
    }));
    const supabase = buildImportHistorySupabaseStub({
      batches,
      transactions: batches.map((batch, index) => ({
        amount: -10,
        category_id: null,
        categorized_by_rule_id: null,
        created_at: "2026-06-01T10:00:00.000Z",
        id: `tx-${index + 1}`,
        import_batch_id: batch.id,
        recipient: `Recipient ${index + 1}`,
        title: `Title ${index + 1}`,
        transaction_date: "2026-06-01",
        updated_at: "2026-06-01T10:00:00.000Z",
        user_id: "user-1",
      })),
    });

    const history = await listImportBatchHistory(supabase as never, "user-1");

    expect(history).toHaveLength(50);
  });

  it("defaults to the newest pending batch and falls back to the newest completed batch", async () => {
    const pendingSupabase = buildImportHistorySupabaseStub();
    const completedOnlySupabase = buildImportHistorySupabaseStub({
      batches: [
        {
          bank: "revolut",
          id: "batch-complete-older",
          imported_at: "2026-06-11T10:00:00.000Z",
          review_completed_at: "2026-06-11T11:00:00.000Z",
          source_filename: "older.csv",
          statement_month: "2026-05-01",
          user_id: "user-1",
        },
        {
          bank: "ing",
          id: "batch-complete-newest",
          imported_at: "2026-06-13T10:00:00.000Z",
          review_completed_at: "2026-06-13T11:00:00.000Z",
          source_filename: "newest.csv",
          statement_month: "2026-06-01",
          user_id: "user-1",
        },
      ],
      transactions: [
        {
          amount: -10,
          category_id: null,
          categorized_by_rule_id: null,
          created_at: "2026-06-13T10:00:00.000Z",
          id: "tx-complete-newest",
          import_batch_id: "batch-complete-newest",
          recipient: "Completed newest",
          title: "Completed newest",
          transaction_date: "2026-06-02",
          updated_at: "2026-06-13T10:00:00.000Z",
          user_id: "user-1",
        },
      ],
    });

    await expect(loadDefaultImportBatchReview(pendingSupabase as never, "user-1")).resolves.toMatchObject({
      batch: {
        id: "batch-pending-latest-import",
      },
    });
    await expect(loadDefaultImportBatchReview(completedOnlySupabase as never, "user-1")).resolves.toMatchObject({
      batch: {
        id: "batch-complete-newest",
      },
    });
  });

  it("returns null when no import history exists", async () => {
    const supabase = buildImportHistorySupabaseStub({
      batches: [],
      transactions: [],
      rules: [],
    });

    await expect(loadDefaultImportBatchReview(supabase as never, "user-1")).resolves.toBeNull();
    await expect(listImportBatchHistory(supabase as never, "user-1")).resolves.toEqual([]);
  });
});

describe("import API routes", () => {
  it("loads an owned import batch review through the batch read route", async () => {
    const batchRoute: typeof import("@/pages/api/imports/batches/[id]") =
      await import("@/pages/api/imports/batches/[id]");
    const supabase = buildImportHistorySupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await batchRoute.GET({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: { id: "batch-pending-latest-import" },
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/batches/batch-pending-latest-import", {
        method: "GET",
      }),
    } as never);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      batch: { id: string };
      transactions: { import_batch_id: string }[];
    };

    expect(payload).toMatchObject({
      batch: {
        id: "batch-pending-latest-import",
      },
      transactions: [
        {
          import_batch_id: "batch-pending-latest-import",
        },
        {
          import_batch_id: "batch-pending-latest-import",
        },
      ],
    });
  });

  it("parses a preview upload and reports an existing monthly batch", async () => {
    const previewRoute: typeof import("@/pages/api/imports/preview") = await import("@/pages/api/imports/preview");
    const supabase = buildImportSupabaseStub({ existingBatch: true });

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const formData = new FormData();
    formData.set("bank", "revolut");
    formData.set("file", new File([validRevolutCsv], "revolut.csv", { type: "text/csv" }));

    const response = await previewRoute.POST({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/preview", {
        method: "POST",
        body: formData,
      }),
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text()) as {
      bank: string;
      existing_batch: { id: string } | null;
      statement_month: string;
    };

    expect(payload).toMatchObject({
      bank: "revolut",
      existing_batch: {
        id: "batch-existing",
      },
      statement_month: "2026-05-01",
    });
  });

  it("parses an ING preview upload and reports an existing monthly batch", async () => {
    const previewRoute: typeof import("@/pages/api/imports/preview") = await import("@/pages/api/imports/preview");
    const supabase = buildImportSupabaseStub({ bank: "ing", existingBatch: true });

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const formData = new FormData();
    formData.set("bank", "ing");
    formData.set("file", new File([validIngCsv], "ing.csv", { type: "text/csv" }));

    const response = await previewRoute.POST({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/preview", {
        method: "POST",
        body: formData,
      }),
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text()) as {
      bank: string;
      existing_batch: { bank: string; id: string } | null;
      statement_month: string;
      transactions: { recipient: string; title: string; transaction_date: string }[];
    };

    expect(payload).toMatchObject({
      bank: "ing",
      existing_batch: {
        bank: "ing",
        id: "batch-existing",
      },
      statement_month: "2026-05-01",
    });
    expect(payload.transactions[0]).toMatchObject({
      recipient: "sts.pl ul. Porcelanowa 8 KATOWICE",
      title: "TR.BLIK",
      transaction_date: "2026-05-30",
    });
  });

  it("rejects commit requests that do not use application/json", async () => {
    const commitRoute: typeof import("@/pages/api/imports/commit") = await import("@/pages/api/imports/commit");
    const supabase = buildImportSupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await commitRoute.POST({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/commit", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: JSON.stringify({}),
      }),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "This endpoint expects application/json",
      field: "content-type",
    });
  });

  it("rejects commit requests with missing imported transactions", async () => {
    const commitRoute: typeof import("@/pages/api/imports/commit") = await import("@/pages/api/imports/commit");
    const supabase = buildImportSupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await commitRoute.POST({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/commit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          bank: "revolut",
          confirm_replace: false,
          period_end: "2026-05-28",
          period_start: "2026-05-03",
          source_filename: "revolut.csv",
          statement_month: "2026-05-01",
        }),
      }),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "transactions must contain at least one imported row",
      field: "transactions",
    });
  });

  it("rejects preview uploads with a non-CSV file extension", async () => {
    const previewRoute: typeof import("@/pages/api/imports/preview") = await import("@/pages/api/imports/preview");
    const supabase = buildImportSupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const formData = new FormData();
    formData.set("bank", "revolut");
    formData.set("file", new File(["not-a-csv"], "revolut.txt", { type: "text/plain" }));

    const response = await previewRoute.POST({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/preview", {
        method: "POST",
        body: formData,
      }),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "The uploaded file must use the .csv extension",
      field: "file",
    });
  });

  it("rejects preview uploads with an empty CSV file", async () => {
    const previewRoute: typeof import("@/pages/api/imports/preview") = await import("@/pages/api/imports/preview");
    const supabase = buildImportSupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const formData = new FormData();
    formData.set("bank", "revolut");
    formData.set("file", new File([""], "revolut.csv", { type: "text/csv" }));

    const response = await previewRoute.POST({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/preview", {
        method: "POST",
        body: formData,
      }),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "The uploaded CSV file is empty",
      field: "file",
    });
  });

  it("returns a replacement confirmation error from the commit route", async () => {
    const commitRoute: typeof import("@/pages/api/imports/commit") = await import("@/pages/api/imports/commit");
    const supabase = buildImportSupabaseStub({ existingBatch: true });

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await commitRoute.POST({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/commit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          bank: "revolut",
          confirm_replace: false,
          period_end: "2026-05-28",
          period_start: "2026-05-03",
          source_filename: "revolut.csv",
          statement_month: "2026-05-01",
          transactions: [
            {
              amount: -12.34,
              recipient: "Lidl Warszawa",
              title: "Lidl Warszawa",
              transaction_date: "2026-05-03",
            },
          ],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    const payload = JSON.parse(await response.text()) as {
      error: string;
      field: string | null;
    };

    expect(payload.error).toMatch(/Replacement confirmation is required/);
    expect(payload.field).toBe("confirm_replace");
  });

  it("returns a truthful error when a confirmed replacement fails mid-flight", async () => {
    const commitRoute: typeof import("@/pages/api/imports/commit") = await import("@/pages/api/imports/commit");
    const supabase = buildImportSupabaseStub({ existingBatch: true, failReplacementInsert: true });

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await commitRoute.POST({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/commit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          bank: "revolut",
          confirm_replace: true,
          period_end: "2026-05-28",
          period_start: "2026-05-03",
          source_filename: "revolut.csv",
          statement_month: "2026-05-01",
          transactions: [
            {
              amount: -12.34,
              recipient: "Lidl Warszawa",
              title: "Lidl Warszawa",
              transaction_date: "2026-05-03",
            },
          ],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    const payload = JSON.parse(await response.text()) as {
      error: string;
      field: string | null;
    };

    expect(payload.error).toMatch(/replacement insert failed/);
    expect(payload.field).toBeNull();
  });

  it("updates category assignments through the transaction review route", async () => {
    const transactionRoute: typeof import("@/pages/api/imports/transactions/[id]") =
      await import("@/pages/api/imports/transactions/[id]");
    const supabase = buildImportSupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await transactionRoute.PATCH({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: { id: "tx-1" },
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/transactions/tx-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          category_id: "cat-travel",
          save_rule: true,
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      rule: { target_category_id: string } | null;
      transaction: { category_id: string | null };
    };

    expect(payload.transaction.category_id).toBe("cat-travel");
    expect(payload.rule?.target_category_id).toBe("cat-travel");
  });

  it("updates category assignments through the bulk transaction review route", async () => {
    const bulkRoute: typeof import("@/pages/api/imports/transactions/bulk") =
      await import("@/pages/api/imports/transactions/bulk");
    const { supabase } = buildBulkImportSupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await bulkRoute.PATCH({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/transactions/bulk", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          updates: [
            {
              category_id: "cat-travel",
              transaction_id: "tx-food",
            },
            {
              category_id: "cat-travel",
              transaction_id: "tx-missing",
            },
          ],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      failed: { error: string; transaction_id: string }[];
      updated: { category_id: string | null; id: string }[];
    };

    expect(payload).toMatchObject({
      failed: [
        {
          error: "Imported transaction was not found",
          transaction_id: "tx-missing",
        },
      ],
      updated: [
        {
          category_id: "cat-travel",
          id: "tx-food",
        },
      ],
    });
  });

  it("returns row-level failures when no bulk transaction review rows can be saved", async () => {
    const bulkRoute: typeof import("@/pages/api/imports/transactions/bulk") =
      await import("@/pages/api/imports/transactions/bulk");
    const { supabase } = buildBulkImportSupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await bulkRoute.PATCH({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/imports/transactions/bulk", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          updates: [
            {
              category_id: "cat-travel",
              transaction_id: "tx-missing",
            },
          ],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      failed: { error: string; transaction_id: string }[];
      updated: { category_id: string | null; id: string }[];
    };

    expect(payload).toMatchObject({
      failed: [
        {
          error: "Imported transaction was not found",
          transaction_id: "tx-missing",
        },
      ],
      updated: [],
    });
  });
});

describe("transaction review table", () => {
  it("derives only changed category drafts as bulk updates", () => {
    expect(
      buildDirtyCategoryUpdates(reviewTransactions, {
        "tx-1": "cat-food",
        "tx-2": "cat-travel",
      }),
    ).toEqual([
      {
        category_id: "cat-travel",
        transaction_id: "tx-2",
      },
    ]);
  });

  it("clears successful drafts and keeps row failures attached after a partial bulk save", () => {
    expect(
      buildBulkSaveFeedback(
        {
          "tx-1": "cat-travel",
          "tx-2": "cat-food",
        },
        {
          failed: [
            {
              error: "Selected category was not found",
              transaction_id: "tx-2",
            },
          ],
          updated: [
            {
              category_id: "cat-travel",
              id: "tx-1",
            },
          ],
        },
      ),
    ).toEqual({
      drafts: {
        "tx-2": "cat-food",
      },
      errorById: {
        "tx-2": "Selected category was not found",
      },
      successById: {
        "tx-1": "Category saved.",
      },
    });
  });

  it("shows no unsaved-change controls before categories are changed", () => {
    const markup = renderToStaticMarkup(
      createElement(TransactionReviewTable, {
        categories: reviewCategories,
        onSaveCategoryChanges: vi.fn(() =>
          Promise.resolve({
            failed: [],
            updated: [],
          }),
        ),
        onCreateRuleFromReview: vi.fn(() =>
          Promise.resolve({
            anchor_transaction: reviewTransactions[0],
            applied_transactions: [],
            match_count: 0,
            rule: {
              id: "rule-1",
              match_field: "recipient",
              match_text: "Lidl Warszawa",
              target_category_id: "cat-food",
            },
            skipped_rows: [],
          }),
        ),
        transactions: reviewTransactions,
      }),
    );

    expect(markup).not.toContain("Save all changes");
    expect(markup).not.toContain("Discard changes");
    expect(markup).not.toContain("Save category");
  });

  it("shows the correct unsaved-change count when multiple rows are dirty", () => {
    const markup = renderToStaticMarkup(
      createElement(TransactionReviewTable, {
        categories: reviewCategories,
        initialDrafts: {
          "tx-1": "cat-travel",
          "tx-2": "cat-food",
        },
        onSaveCategoryChanges: vi.fn(() =>
          Promise.resolve({
            failed: [],
            updated: [],
          }),
        ),
        onCreateRuleFromReview: vi.fn(() =>
          Promise.resolve({
            anchor_transaction: reviewTransactions[0],
            applied_transactions: [],
            match_count: 0,
            rule: {
              id: "rule-1",
              match_field: "recipient",
              match_text: "Lidl Warszawa",
              target_category_id: "cat-food",
            },
            skipped_rows: [],
          }),
        ),
        transactions: reviewTransactions,
      }),
    );

    expect(markup).toContain("2 unsaved changes");
    expect(markup).toContain("Save all changes");
    expect(markup).toContain("Discard changes");
  });

  it("shows row-level failure copy for rows that still need attention", () => {
    const markup = renderToStaticMarkup(
      createElement(TransactionReviewTable, {
        categories: reviewCategories,
        initialDrafts: {
          "tx-2": "cat-food",
        },
        initialRowErrors: {
          "tx-2": "Selected category was not found",
        },
        onSaveCategoryChanges: vi.fn(() =>
          Promise.resolve({
            failed: [],
            updated: [],
          }),
        ),
        onCreateRuleFromReview: vi.fn(() =>
          Promise.resolve({
            anchor_transaction: reviewTransactions[0],
            applied_transactions: [],
            match_count: 0,
            rule: {
              id: "rule-1",
              match_field: "recipient",
              match_text: "Lidl Warszawa",
              target_category_id: "cat-food",
            },
            skipped_rows: [],
          }),
        ),
        transactions: reviewTransactions,
      }),
    );

    expect(markup).toContain("Unsaved category change.");
    expect(markup).toContain("Selected category was not found");
  });

  it("builds review rule drafts with recipient as the default field and anchor text", () => {
    expect(buildInitialReviewRuleDraft(reviewTransactions[1])).toEqual({
      category_id: null,
      match_field: "recipient",
      match_text: "PKP Intercity",
      transaction_id: "tx-2",
    });
  });

  it("counts matching rows and drafted skips for the rule preview without listing rows", () => {
    expect(
      buildReviewRulePreview(
        [
          reviewTransactions[0],
          reviewTransactions[1],
          {
            ...reviewTransactions[1],
            id: "tx-3",
            recipient: "PKP Intercity",
            title: "Rail ticket",
          },
        ],
        "tx-2",
        {
          category_id: "cat-travel",
          match_field: "recipient",
          match_text: "PKP",
          transaction_id: "tx-2",
        },
        [{ category_id: "cat-food", transaction_id: "tx-3" }],
      ),
    ).toEqual({
      matchingRowCount: 1,
      skippedDirtyCount: 1,
    });
  });

  it("renders persisted rule provenance badges on rule-backed rows", () => {
    const markup = renderToStaticMarkup(
      createElement(TransactionReviewTable, {
        categories: reviewCategories,
        onCreateRuleFromReview: vi.fn(() =>
          Promise.resolve({
            anchor_transaction: reviewTransactions[0],
            applied_transactions: [],
            match_count: 0,
            rule: {
              id: "rule-1",
              match_field: "recipient",
              match_text: "Lidl",
              target_category_id: "cat-food",
            },
            skipped_rows: [],
          }),
        ),
        onSaveCategoryChanges: vi.fn(() =>
          Promise.resolve({
            failed: [],
            updated: [],
          }),
        ),
        transactions: [
          {
            ...reviewTransactions[0],
            categorized_by_rule_id: "rule-1",
            category_rule: {
              id: "rule-1",
              match_field: "recipient",
              match_text: "Lidl",
              target_category_id: "cat-food",
            },
          },
        ],
      }),
    );

    expect(markup).toContain("Rule: recipient contains");
    expect(markup).toContain("&quot;Lidl&quot;");
  });
});

describe("import workspace helpers", () => {
  it("builds a history summary from the active batch payload", () => {
    expect(
      buildImportHistorySummary(
        {
          bank: "revolut",
          created_at: "2026-06-12T10:00:00.000Z",
          id: "batch-history-new",
          imported_at: "2026-06-12T10:00:00.000Z",
          period_end: "2026-05-31",
          period_start: "2026-05-01",
          review_completed_at: null,
          source_filename: "fresh.csv",
          statement_month: "2026-05-01",
          updated_at: "2026-06-12T10:00:00.000Z",
          user_id: "user-1",
        },
        4,
      ),
    ).toEqual({
      bank: "revolut",
      id: "batch-history-new",
      imported_at: "2026-06-12T10:00:00.000Z",
      review_completed_at: null,
      source_filename: "fresh.csv",
      statement_month: "2026-05-01",
      transaction_count: 4,
    });
  });

  it("keeps pending-first ordering when reconciling newly imported or completed batches", () => {
    const history = reconcileImportHistory(
      reviewBatchHistory,
      {
        bank: "ing",
        created_at: "2026-06-14T10:00:00.000Z",
        id: "batch-complete-newer-month",
        imported_at: "2026-06-14T10:00:00.000Z",
        period_end: "2026-06-30",
        period_start: "2026-06-01",
        review_completed_at: null,
        source_filename: "completed-now-pending.csv",
        statement_month: "2026-06-01",
        updated_at: "2026-06-14T10:00:00.000Z",
        user_id: "user-1",
      },
      5,
    );

    expect(history.map((item) => item.id)).toEqual(["batch-complete-newer-month", "batch-pending-latest-import"]);
    expect(history[0]).toMatchObject({
      review_completed_at: null,
      source_filename: "completed-now-pending.csv",
      transaction_count: 5,
    });
  });

  it("finds the default batch from the first history item", () => {
    expect(findDefaultImportHistoryBatchId(reviewBatchHistory)).toBe("batch-pending-latest-import");
    expect(findDefaultImportHistoryBatchId([])).toBeNull();
  });

  it("adds and removes the batch query parameter while preserving other URL parts", () => {
    expect(
      buildImportWorkspaceUrl("batch-2", {
        hash: "#history",
        pathname: "/imports",
        search: "?from=dashboard",
      }),
    ).toBe("/imports?from=dashboard&batch=batch-2#history");

    expect(
      buildImportWorkspaceUrl(null, {
        hash: "",
        pathname: "/imports",
        search: "?from=dashboard&batch=batch-2",
      }),
    ).toBe("/imports?from=dashboard");
  });

  it("loads a selected batch through the owned review API contract", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            batch: {
              bank: "revolut",
              created_at: "2026-06-12T10:00:00.000Z",
              id: "batch-pending-latest-import",
              imported_at: "2026-06-12T10:00:00.000Z",
              period_end: "2026-05-31",
              period_start: "2026-05-01",
              review_completed_at: null,
              source_filename: "pending-latest.csv",
              statement_month: "2026-05-01",
              updated_at: "2026-06-12T10:00:00.000Z",
              user_id: "user-1",
            },
            transactions: reviewTransactions,
          }),
        ok: true,
      } satisfies Pick<Response, "json" | "ok">),
    ) as unknown as typeof fetch;

    await expect(loadImportBatchReviewFromApi("batch-pending-latest-import", fetchMock)).resolves.toMatchObject({
      batch: {
        id: "batch-pending-latest-import",
      },
      transactions: reviewTransactions,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/imports/batches/batch-pending-latest-import");
  });

  it("sends bulk category drafts to the bulk review endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
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
          }),
        ok: true,
      } satisfies Pick<Response, "json" | "ok">),
    ) as unknown as typeof fetch;

    await expect(
      saveImportCategoryChanges(
        [
          {
            category_id: "cat-travel",
            transaction_id: "tx-1",
          },
          {
            category_id: "cat-food",
            transaction_id: "tx-2",
          },
        ],
        fetchMock,
      ),
    ).resolves.toEqual({
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

    expect(fetchMock).toHaveBeenCalledWith("/api/imports/transactions/bulk", {
      body: JSON.stringify({
        updates: [
          {
            category_id: "cat-travel",
            transaction_id: "tx-1",
          },
          {
            category_id: "cat-food",
            transaction_id: "tx-2",
          },
        ],
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    });
  });

  it("sends review-rule payloads to the dedicated review-rule endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            anchor_transaction: reviewTransactions[0],
            applied_transactions: [],
            match_count: 1,
            rule: {
              id: "rule-1",
              match_field: "recipient",
              match_text: "Lidl",
              target_category_id: "cat-food",
            },
            skipped_rows: [],
          }),
        ok: true,
      } satisfies Pick<Response, "json" | "ok">),
    ) as unknown as typeof fetch;

    await expect(
      createImportReviewRule(
        {
          apply_now: true,
          category_id: "cat-food",
          dirty_transaction_ids: ["tx-2"],
          match_field: "recipient",
          match_text: "Lidl",
          transaction_id: "tx-1",
        },
        fetchMock,
      ),
    ).resolves.toMatchObject({
      match_count: 1,
      rule: {
        id: "rule-1",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/imports/transactions/rule", {
      body: JSON.stringify({
        apply_now: true,
        category_id: "cat-food",
        dirty_transaction_ids: ["tx-2"],
        match_field: "recipient",
        match_text: "Lidl",
        transaction_id: "tx-1",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  });

  it("merges successful bulk category saves into local transactions only for updated rows", () => {
    expect(
      mergeImportedTransactionCategoryUpdates(reviewTransactions, [
        {
          category_id: "cat-travel",
          id: "tx-1",
        },
      ]),
    ).toEqual([
      {
        ...reviewTransactions[0],
        category_id: "cat-travel",
        categorized_by_rule_id: null,
        category_rule: null,
      },
      reviewTransactions[1],
    ]);
  });

  it("merges anchor and applied review-rule updates without wiping untouched rows", () => {
    expect(
      mergeImportedTransactions(reviewTransactions, [
        {
          ...reviewTransactions[0],
          categorized_by_rule_id: "rule-1",
          category_id: "cat-food",
          category_rule: {
            id: "rule-1",
            match_field: "recipient",
            match_text: "Lidl",
            target_category_id: "cat-food",
          },
        },
        {
          ...reviewTransactions[1],
          categorized_by_rule_id: "rule-1",
          category_id: "cat-food",
          category_rule: {
            id: "rule-1",
            match_field: "recipient",
            match_text: "Lidl",
            target_category_id: "cat-food",
          },
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        categorized_by_rule_id: "rule-1",
        id: "tx-1",
      }),
      expect.objectContaining({
        categorized_by_rule_id: "rule-1",
        id: "tx-2",
      }),
    ]);
  });
});

describe("import UI", () => {
  it("renders import history metadata with active-state semantics for recent batches", () => {
    const markup = renderToStaticMarkup(
      createElement(ImportHistory, {
        activeBatchId: "batch-pending-latest-import",
        history: reviewBatchHistory,
      }),
    );

    expect(markup).toContain("Import history");
    expect(markup).toContain("Resume older import reviews");
    expect(markup).toContain("May 2026");
    expect(markup).toContain("June 2026");
    expect(markup).toContain("Pending review");
    expect(markup).toContain("Completed review");
    expect(markup).toContain("pending-latest.csv");
    expect(markup).toContain("completed-newer.csv");
    expect(markup).toContain("2 transactions");
    expect(markup).toContain("1 transaction");
    expect(markup).toContain('aria-current="page"');
  });

  it("renders an empty import history state when no batches exist", () => {
    const markup = renderToStaticMarkup(
      createElement(ImportHistory, {
        activeBatchId: null,
        history: [],
      }),
    );

    expect(markup).toContain("No import history yet.");
    expect(markup).toContain("Upload a supported statement");
  });

  it("renders mobile slide-over dialog semantics for import history", () => {
    const markup = renderToStaticMarkup(
      createElement(ImportHistory, {
        activeBatchId: "batch-pending-latest-import",
        history: reviewBatchHistory,
        initialMobileOpen: true,
      }),
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("Recent import batches");
    expect(markup).toContain("Close import history");
  });

  it("renders workspace history controls alongside a no-active-review empty state", () => {
    const markup = renderToStaticMarkup(
      createElement(ImportWorkspace, {
        categories: reviewCategories,
        initialBatch: null,
        initialHistory: reviewBatchHistory,
        initialSelectedBatchId: null,
        initialTransactions: [],
      }),
    );

    expect(markup).toContain("Hide history");
    expect(markup).toContain("No active review is loaded yet.");
    expect(markup).toContain("Open a batch from recent history");
  });

  it("renders a bank selector for Revolut and ING uploads", () => {
    const markup = renderToStaticMarkup(
      createElement(ImportUploadForm, {
        isCommitting: false,
        preview: null,
        onPreviewLoaded: vi.fn(),
        onCommitRequested: vi.fn(() => Promise.resolve()),
      }),
    );

    expect(markup).toContain('data-testid="bank-selector"');
    expect(markup).toContain("Revolut CSV");
    expect(markup).toContain("ING CSV");
  });

  it("shows a replacement warning when previewing an existing monthly batch", () => {
    const markup = renderToStaticMarkup(
      createElement(ImportUploadForm, {
        isCommitting: false,
        preview: {
          bank: "revolut",
          existing_batch: {
            bank: "revolut",
            id: "batch-existing",
            imported_at: "2026-05-01T08:00:00.000Z",
            period_end: "2026-05-31",
            period_start: "2026-05-01",
            review_completed_at: null,
            source_filename: "older.csv",
            statement_month: "2026-05-01",
          },
          period_end: "2026-05-29",
          period_start: "2026-05-01",
          source_filename: "revolut.csv",
          statement_month: "2026-05-01",
          transactions: [
            {
              amount: -36.97,
              recipient: "ROSSMANN",
              title: "Płatność kartą",
              transaction_date: "2026-05-01",
            },
          ],
        },
        onPreviewLoaded: vi.fn(),
        onCommitRequested: vi.fn(() => Promise.resolve()),
      }),
    );

    expect(markup).toContain("Existing batch found for this bank and month");
    expect(markup).toContain("Replace existing batch");
  });

  it("shows the selected bank in the preview summary", () => {
    const markup = renderToStaticMarkup(
      createElement(ImportUploadForm, {
        isCommitting: false,
        preview: {
          bank: "ing",
          existing_batch: null,
          period_end: "2026-05-30",
          period_start: "2026-05-16",
          source_filename: "ing.csv",
          statement_month: "2026-05-01",
          transactions: [
            {
              amount: -10,
              recipient: "sts.pl ul. Porcelanowa 8 KATOWICE",
              title: "TR.BLIK",
              transaction_date: "2026-05-30",
            },
          ],
        },
        onPreviewLoaded: vi.fn(),
        onCommitRequested: vi.fn(() => Promise.resolve()),
      }),
    );

    expect(markup).toContain("ING CSV");
    expect(markup).toContain("1 imported rows");
  });

  it("renders completion-blocked copy and disables review completion while drafts are unsaved", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewCompletionBar, {
        batch: {
          bank: "revolut",
          created_at: "2026-05-30T08:00:00.000Z",
          id: "batch-1",
          imported_at: "2026-05-30T08:00:00.000Z",
          period_end: "2026-05-29",
          period_start: "2026-05-01",
          review_completed_at: null,
          source_filename: "revolut.csv",
          statement_month: "2026-05-01",
          updated_at: "2026-05-30T08:00:00.000Z",
          user_id: "user-1",
        },
        completionBlockedReason: "Save or discard category changes before marking this review complete.",
        isCompletionBlocked: true,
        onComplete: vi.fn(() => Promise.resolve()),
        transactionCount: 2,
      }),
    );

    expect(markup).toContain("Save or discard category changes before marking this review complete.");
    expect(markup).toContain("disabled");
    expect(markup).toContain("Mark review complete");
  });

  it("renders completed batches as still editable correction surfaces", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewCompletionBar, {
        batch: {
          bank: "revolut",
          created_at: "2026-05-30T08:00:00.000Z",
          id: "batch-complete",
          imported_at: "2026-05-30T08:00:00.000Z",
          period_end: "2026-05-29",
          period_start: "2026-05-01",
          review_completed_at: "2026-05-31T08:00:00.000Z",
          source_filename: "revolut.csv",
          statement_month: "2026-05-01",
          updated_at: "2026-05-31T08:00:00.000Z",
          user_id: "user-1",
        },
        completionBlockedReason: null,
        isCompletionBlocked: false,
        onComplete: vi.fn(() => Promise.resolve()),
        transactionCount: 2,
      }),
    );

    expect(markup).toContain("This batch was already confirmed and stays open for corrections.");
    expect(markup).toContain("still flows through to summaries without reopening review");
    expect(markup).toContain("Review complete");
    expect(markup).not.toContain("Mark review complete");
  });
});
