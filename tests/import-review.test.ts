import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ImportUploadForm } from "@/components/imports/ImportUploadForm";
import {
  buildBulkSaveFeedback,
  buildDirtyCategoryUpdates,
  TransactionReviewTable,
} from "@/components/imports/TransactionReviewTable";
import type { BudgetCategory } from "@/lib/budget/data";
import {
  validateImportCategoryUpdatesPayload,
  validateImportCommitPayload,
  validateSupportedBank,
} from "@/lib/imports/validation";
import { createClient } from "@/lib/supabase";
import {
  commitImportBatch,
  markBatchReviewComplete,
  type ImportedTransaction,
  updateImportTransactionCategories,
  updateTransactionCategoryAndMaybeRule,
} from "@/lib/imports/data";
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

function createDeleteChain(error: { code?: string; message: string } | null = null) {
  return {
    eq: vi.fn().mockReturnThis(),
    then(resolve: (value: { error: typeof error }) => unknown) {
      resolve({ error });
    },
  };
}

function buildImportSupabaseStub(options?: {
  bank?: "revolut" | "ing";
  completeBatchUpdate?: boolean;
  existingBatch?: boolean;
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
      created_at: "2026-05-30T08:00:00.000Z",
      import_batch_id: options?.existingBatch ? "batch-existing" : "batch-1",
      recipient: "Lidl Warszawa",
      title: "Lidl Warszawa",
      transaction_date: "2026-05-03",
      updated_at: "2026-05-30T08:00:00.000Z",
      user_id: "user-1",
    },
  ];
  const updatedTransaction = {
    ...insertedTransactions[0],
    category_id: "cat-travel",
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

  return {
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
          delete: vi.fn().mockReturnValue(createDeleteChain()),
          insert: vi.fn().mockReturnValue(createInsertManyChain(insertedTransactions)),
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
    expect(transactionUpdates).toEqual([{ category_id: "cat-travel" }, { category_id: "cat-food" }]);
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
});

describe("import API routes", () => {
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

  it("returns an error when no bulk transaction review rows can be saved", async () => {
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

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      error: string;
      field: string | null;
    };

    expect(payload).toMatchObject({
      error: "No transaction categories could be updated",
      field: "updates",
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
        onSaveRuleShortcut: vi.fn(() => Promise.resolve()),
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
        onSaveRuleShortcut: vi.fn(() => Promise.resolve()),
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
        onSaveRuleShortcut: vi.fn(() => Promise.resolve()),
        transactions: reviewTransactions,
      }),
    );

    expect(markup).toContain("Unsaved category change.");
    expect(markup).toContain("Selected category was not found");
  });
});

describe("import UI", () => {
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
});
