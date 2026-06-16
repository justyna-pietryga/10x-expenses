import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CategoryUsageTable } from "@/components/dashboard/CategoryUsageTable";
import { ExcludedTransactionsPanel } from "@/components/dashboard/ExcludedTransactionsPanel";
import { IncompleteReviewNotice } from "@/components/dashboard/IncompleteReviewNotice";
import { MonthlySummaryHeader } from "@/components/dashboard/MonthlySummaryHeader";
import { SummaryWorkspace } from "@/components/dashboard/SummaryWorkspace";
import { RuleManager } from "@/components/rules/RuleManager";
import { createClient } from "@/lib/supabase";
import { loadDashboardSummary } from "@/lib/summary/data";
import { findMatchingRule, ruleMatchesTransaction } from "@/lib/rules/data";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

function createSelectChain(data: unknown, error: { code?: string; message: string } | null = null) {
  return {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    order: vi.fn().mockResolvedValue({ data, error }),
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

function createUpdateSingleChain(data: unknown, error: { code?: string; message: string } | null = null) {
  return {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

function createDeleteSingleChain(data: unknown, error: { code?: string; message: string } | null = null) {
  return {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

interface SummaryBatchRow {
  bank: string;
  created_at: string;
  id: string;
  imported_at: string;
  period_end: string;
  period_start: string;
  review_completed_at: string | null;
  source_filename: string;
  statement_month: string;
  updated_at: string;
  user_id: string;
}

interface SummaryTransactionRow {
  amount: number;
  cashflow_type?: "expense" | "income";
  category_id: string | null;
  created_at: string;
  id: string;
  import_batch_id: string;
  is_included: boolean;
  recipient: string;
  title: string;
  transaction_date: string;
  updated_at: string;
  user_id: string;
}

interface MonthlyIncomeRow {
  amount: number;
  created_at: string;
  id: string;
  is_estimated: boolean;
  month: string;
  updated_at: string;
  user_id: string;
}

interface SummarySnapshotRecord {
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

interface SummaryStubOptions {
  existingSummary?: SummarySnapshotRecord | null;
  historicalBatches?: SummaryBatchRow[];
  historicalTransactions?: SummaryTransactionRow[];
  monthlyIncomes?: MonthlyIncomeRow[];
  selectedBatches?: SummaryBatchRow[];
  selectedTransactions?: SummaryTransactionRow[];
}

function buildSummarySupabaseStub(options: SummaryStubOptions = {}) {
  const categories = [
    {
      id: "cat-food",
      user_id: "user-1",
      name: "Food",
      percentage_limit: 20,
      carryover_enabled: false,
      archived_at: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    },
    {
      id: "cat-travel",
      user_id: "user-1",
      name: "Travel",
      percentage_limit: 10,
      carryover_enabled: true,
      archived_at: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    },
  ];
  const monthlyIncomes = options.monthlyIncomes ?? [
    {
      id: "income-apr",
      user_id: "user-1",
      month: "2026-04-01",
      amount: 1000,
      is_estimated: false,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    },
    {
      id: "income-may",
      user_id: "user-1",
      month: "2026-05-01",
      amount: 1000,
      is_estimated: false,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
    },
  ];
  const selectedBatches = options.selectedBatches ?? [
    {
      id: "batch-may-reviewed",
      user_id: "user-1",
      bank: "revolut",
      statement_month: "2026-05-01",
      period_start: "2026-05-01",
      period_end: "2026-05-29",
      source_filename: "may-reviewed.csv",
      imported_at: "2026-05-29T12:00:00.000Z",
      review_completed_at: "2026-05-30T12:00:00.000Z",
      created_at: "2026-05-29T12:00:00.000Z",
      updated_at: "2026-05-29T12:00:00.000Z",
    },
    {
      id: "batch-may-pending",
      user_id: "user-1",
      bank: "revolut",
      statement_month: "2026-05-01",
      period_start: "2026-05-01",
      period_end: "2026-05-29",
      source_filename: "may-pending.csv",
      imported_at: "2026-05-30T12:00:00.000Z",
      review_completed_at: null,
      created_at: "2026-05-30T12:00:00.000Z",
      updated_at: "2026-05-30T12:00:00.000Z",
    },
  ];
  const historicalBatches = options.historicalBatches ?? [
    {
      id: "batch-apr-reviewed",
      user_id: "user-1",
      bank: "revolut",
      statement_month: "2026-04-01",
      period_start: "2026-04-01",
      period_end: "2026-04-30",
      source_filename: "apr-reviewed.csv",
      imported_at: "2026-04-30T12:00:00.000Z",
      review_completed_at: "2026-04-30T20:00:00.000Z",
      created_at: "2026-04-30T12:00:00.000Z",
      updated_at: "2026-04-30T12:00:00.000Z",
    },
    ...selectedBatches,
  ];
  const selectedTransactions = options.selectedTransactions ?? [
    {
      id: "tx-may-food",
      user_id: "user-1",
      import_batch_id: "batch-may-reviewed",
      amount: -200,
      category_id: "cat-food",
      is_included: true,
      recipient: "Lidl",
      title: "Card payment",
      transaction_date: "2026-05-02",
      created_at: "2026-05-02T00:00:00.000Z",
      updated_at: "2026-05-02T00:00:00.000Z",
    },
    {
      id: "tx-may-uncategorized",
      user_id: "user-1",
      import_batch_id: "batch-may-reviewed",
      amount: -50,
      category_id: null,
      is_included: true,
      recipient: "Unknown",
      title: "Wire",
      transaction_date: "2026-05-05",
      created_at: "2026-05-05T00:00:00.000Z",
      updated_at: "2026-05-05T00:00:00.000Z",
    },
    {
      id: "tx-may-pending",
      user_id: "user-1",
      import_batch_id: "batch-may-pending",
      amount: -30,
      category_id: "cat-travel",
      is_included: true,
      recipient: "Uber",
      title: "Ride",
      transaction_date: "2026-05-07",
      created_at: "2026-05-07T00:00:00.000Z",
      updated_at: "2026-05-07T00:00:00.000Z",
    },
  ];
  const historicalTransactions = options.historicalTransactions ?? [
    {
      id: "tx-apr-travel",
      user_id: "user-1",
      import_batch_id: "batch-apr-reviewed",
      amount: -60,
      category_id: "cat-travel",
      is_included: true,
      recipient: "PKP",
      title: "Train",
      transaction_date: "2026-04-11",
      created_at: "2026-04-11T00:00:00.000Z",
      updated_at: "2026-04-11T00:00:00.000Z",
    },
    ...selectedTransactions.filter((transaction) => transaction.import_batch_id === "batch-may-reviewed"),
  ];

  let monthlySummaryRecord: SummarySnapshotRecord | null = options.existingSummary ?? null;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "statement_import_batches") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "statement_month, review_completed_at") {
              return createSelectChain(
                historicalBatches.map((batch) => ({
                  review_completed_at: batch.review_completed_at,
                  statement_month: batch.statement_month,
                })),
              );
            }

            let data = historicalBatches;
            const chain = {
              eq: vi.fn().mockImplementation((field: string, value: string) => {
                if (field === "statement_month") {
                  data = historicalBatches.filter((batch) => batch.statement_month === value);
                }

                return chain;
              }),
              lte: vi.fn().mockImplementation((field: string, value: string) => {
                if (field === "statement_month") {
                  data = historicalBatches.filter((batch) => batch.statement_month <= value);
                }
                return chain;
              }),
              order: vi.fn().mockImplementation(() => Promise.resolve({ data, error: null })),
            };
            return chain;
          }),
        };
      }

      if (table === "monthly_incomes") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "month") {
              return {
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({
                  data: monthlyIncomes.map(({ month }) => ({ month })),
                  error: null,
                }),
              };
            }

            let month = "2026-05-01";
            const chain = {
              eq: vi.fn().mockImplementation((field: string, value: string) => {
                if (field === "month") {
                  month = value;
                }

                return chain;
              }),
              maybeSingle: vi.fn().mockImplementation(() =>
                Promise.resolve({
                  data: monthlyIncomes.find((income) => income.month === month) ?? null,
                  error: null,
                }),
              ),
            };
            return chain;
          }),
        };
      }

      if (table === "transactions") {
        return {
          select: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockImplementation((_field: string, values: string[]) => {
              const selectedBatchIds = selectedBatches.map((batch) => batch.id);
              const data = values.every((value) => selectedBatchIds.includes(value))
                ? selectedTransactions.filter((transaction) => values.includes(transaction.import_batch_id))
                : historicalTransactions.filter((transaction) => values.includes(transaction.import_batch_id));
              return {
                order: vi.fn().mockResolvedValue({ data, error: null }),
              };
            }),
          })),
        };
      }

      if (table === "budget_categories") {
        return {
          select: vi.fn().mockReturnValue(createSelectChain(categories)),
        };
      }

      if (table === "monthly_summaries") {
        return {
          select: vi.fn().mockImplementation(() => {
            const chain = {
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockImplementation(() =>
                Promise.resolve({
                  data: monthlySummaryRecord,
                  error: null,
                }),
              ),
            };
            return chain;
          }),
          upsert: vi
            .fn()
            .mockImplementation((payload: Omit<SummarySnapshotRecord, "created_at" | "id" | "updated_at">) => ({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockImplementation(() => {
                monthlySummaryRecord = {
                  created_at: monthlySummaryRecord?.created_at ?? "2026-05-31T12:00:00.000Z",
                  generated_at: payload.generated_at,
                  id: monthlySummaryRecord?.id ?? "summary-1",
                  month: payload.month,
                  summary_snapshot: payload.summary_snapshot,
                  total_income: payload.total_income,
                  total_spent: payload.total_spent,
                  updated_at: "2026-05-31T12:00:00.000Z",
                  user_id: payload.user_id,
                };
                return Promise.resolve({ data: monthlySummaryRecord, error: null });
              }),
            })),
        };
      }

      if (table === "categorization_rules") {
        return {
          select: vi.fn().mockReturnValue(createSelectChain([])),
          insert: vi.fn().mockReturnValue(
            createInsertSingleChain({
              id: "rule-created",
              user_id: "user-1",
              match_field: "recipient",
              match_text: "Lidl",
              target_category_id: "cat-food",
              created_at: "2026-05-31T12:00:00.000Z",
              updated_at: "2026-05-31T12:00:00.000Z",
            }),
          ),
          update: vi.fn().mockReturnValue(
            createUpdateSingleChain({
              id: "rule-created",
              user_id: "user-1",
              match_field: "title",
              match_text: "Rent",
              target_category_id: "cat-food",
              created_at: "2026-05-31T12:00:00.000Z",
              updated_at: "2026-05-31T12:00:00.000Z",
            }),
          ),
          delete: vi.fn().mockReturnValue(
            createDeleteSingleChain({
              id: "rule-created",
              user_id: "user-1",
              match_field: "title",
              match_text: "Rent",
              target_category_id: "cat-food",
              created_at: "2026-05-31T12:00:00.000Z",
              updated_at: "2026-05-31T12:00:00.000Z",
            }),
          ),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return Object.assign(supabase, {
    __state: {
      monthlySummaryRecord: () => monthlySummaryRecord,
      selectedTransactions,
    },
  });
}

describe("summary data helpers", () => {
  it("computes reviewed, uncategorized, incomplete, and carry-over values for a selected month", async () => {
    const supabase = buildSummarySupabaseStub();

    const summary = await loadDashboardSummary(supabase as never, "user-1", "2026-05-01");

    expect(summary.selected_month).toBe("2026-05-01");
    expect(summary.total_income).toBe(1000);
    expect(summary.reviewed_categorized_spend).toBe(200);
    expect(summary.reviewed_uncategorized_spend).toBe(50);
    expect(summary.incomplete_review_spend).toBe(30);
    expect(summary.excluded_outflow).toBe(0);
    expect(summary.excluded_inflow).toBe(0);
    expect(summary.total_imported_spend).toBe(280);
    expect(summary.warning_batches).toHaveLength(1);
    expect(summary.category_rows).toContainEqual(
      expect.objectContaining({
        category_id: "cat-travel",
        carryover_enabled: true,
        carryover_opening: 40,
        carryover_closing: 140,
        reviewed_spend: 0,
      }),
    );
  });

  it("defaults to the latest imported month when no month is requested, even if review is still pending", async () => {
    const supabase = buildSummarySupabaseStub();

    const summary = await loadDashboardSummary(supabase as never, "user-1", null);

    expect(summary.selected_month).toBe("2026-05-01");
    expect(summary.available_months[0]).toEqual(
      expect.objectContaining({
        has_completed_review: true,
        has_pending_review: true,
        month: "2026-05-01",
      }),
    );
    expect(summary.incomplete_review_spend).toBe(30);
  });

  it("keeps pending-only months fully untrusted while preserving incomplete-review warnings", async () => {
    const supabase = buildSummarySupabaseStub({
      historicalBatches: [
        {
          id: "batch-may-reviewed",
          user_id: "user-1",
          bank: "revolut",
          statement_month: "2026-05-01",
          period_start: "2026-05-01",
          period_end: "2026-05-29",
          source_filename: "may-reviewed.csv",
          imported_at: "2026-05-29T12:00:00.000Z",
          review_completed_at: "2026-05-30T12:00:00.000Z",
          created_at: "2026-05-29T12:00:00.000Z",
          updated_at: "2026-05-29T12:00:00.000Z",
        },
        {
          id: "batch-jun-pending",
          user_id: "user-1",
          bank: "revolut",
          statement_month: "2026-06-01",
          period_start: "2026-06-01",
          period_end: "2026-06-30",
          source_filename: "jun-pending.csv",
          imported_at: "2026-06-30T12:00:00.000Z",
          review_completed_at: null,
          created_at: "2026-06-30T12:00:00.000Z",
          updated_at: "2026-06-30T12:00:00.000Z",
        },
      ],
      historicalTransactions: [
        {
          id: "tx-may-food",
          user_id: "user-1",
          import_batch_id: "batch-may-reviewed",
          amount: -90,
          category_id: "cat-food",
          is_included: true,
          recipient: "Lidl",
          title: "Card payment",
          transaction_date: "2026-05-05",
          created_at: "2026-05-05T00:00:00.000Z",
          updated_at: "2026-05-05T00:00:00.000Z",
        },
      ],
      monthlyIncomes: [
        {
          id: "income-may",
          user_id: "user-1",
          month: "2026-05-01",
          amount: 1000,
          is_estimated: false,
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "income-jun",
          user_id: "user-1",
          month: "2026-06-01",
          amount: 1200,
          is_estimated: false,
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      selectedBatches: [
        {
          id: "batch-jun-pending",
          user_id: "user-1",
          bank: "revolut",
          statement_month: "2026-06-01",
          period_start: "2026-06-01",
          period_end: "2026-06-30",
          source_filename: "jun-pending.csv",
          imported_at: "2026-06-30T12:00:00.000Z",
          review_completed_at: null,
          created_at: "2026-06-30T12:00:00.000Z",
          updated_at: "2026-06-30T12:00:00.000Z",
        },
      ],
      selectedTransactions: [
        {
          id: "tx-jun-food",
          user_id: "user-1",
          import_batch_id: "batch-jun-pending",
          amount: -140,
          category_id: "cat-food",
          is_included: true,
          recipient: "Biedronka",
          title: "Card payment",
          transaction_date: "2026-06-03",
          created_at: "2026-06-03T00:00:00.000Z",
          updated_at: "2026-06-03T00:00:00.000Z",
        },
      ],
    });

    const summary = await loadDashboardSummary(supabase as never, "user-1", null);

    expect(summary.selected_month).toBe("2026-06-01");
    expect(summary.reviewed_categorized_spend).toBe(0);
    expect(summary.reviewed_uncategorized_spend).toBe(0);
    expect(summary.incomplete_review_spend).toBe(140);
    expect(summary.warning_batches).toEqual([
      expect.objectContaining({
        id: "batch-jun-pending",
        source_filename: "jun-pending.csv",
      }),
    ]);
    expect(summary.category_rows.map((row) => row.reviewed_spend)).toEqual([0, 0]);
  });

  it("recomputes from live transactions and refreshes the cached snapshot on repeated loads", async () => {
    const supabase = buildSummarySupabaseStub({
      existingSummary: {
        id: "summary-existing",
        user_id: "user-1",
        month: "2026-05-01",
        total_income: 1000,
        total_spent: 999,
        generated_at: "2026-05-15T12:00:00.000Z",
        summary_snapshot: {
          reviewed_categorized_spend: 999,
        },
        created_at: "2026-05-15T12:00:00.000Z",
        updated_at: "2026-05-15T12:00:00.000Z",
      },
    });
    const firstSummary = await loadDashboardSummary(supabase as never, "user-1", "2026-05-01");
    const firstSnapshot = supabase.__state.monthlySummaryRecord();
    if (!firstSnapshot) {
      throw new Error("Expected the first load to refresh the monthly summary snapshot");
    }

    expect(firstSummary.reviewed_categorized_spend).toBe(200);
    expect(firstSnapshot.total_spent).toBe(280);

    supabase.__state.selectedTransactions[0].amount = -260;

    const secondSummary = await loadDashboardSummary(supabase as never, "user-1", "2026-05-01");
    const secondSnapshot = supabase.__state.monthlySummaryRecord();
    if (!secondSnapshot) {
      throw new Error("Expected the second load to keep a refreshed monthly summary snapshot");
    }

    expect(secondSummary.reviewed_categorized_spend).toBe(260);
    expect(secondSummary.total_imported_spend).toBe(340);
    expect(secondSnapshot.total_spent).toBe(340);
  });

  it("keeps excluded transactions out of budget totals while tracking split outflow and inflow", async () => {
    const supabase = buildSummarySupabaseStub({
      selectedTransactions: [
        {
          id: "tx-may-food",
          user_id: "user-1",
          import_batch_id: "batch-may-reviewed",
          amount: -200,
          category_id: "cat-food",
          is_included: true,
          recipient: "Lidl",
          title: "Card payment",
          transaction_date: "2026-05-02",
          created_at: "2026-05-02T00:00:00.000Z",
          updated_at: "2026-05-02T00:00:00.000Z",
        },
        {
          id: "tx-may-excluded-outflow",
          user_id: "user-1",
          import_batch_id: "batch-may-reviewed",
          amount: -75,
          category_id: "cat-travel",
          is_included: false,
          recipient: "Transfer out",
          title: "Own transfer",
          transaction_date: "2026-05-03",
          created_at: "2026-05-03T00:00:00.000Z",
          updated_at: "2026-05-03T00:00:00.000Z",
        },
        {
          id: "tx-may-excluded-inflow",
          user_id: "user-1",
          import_batch_id: "batch-may-reviewed",
          amount: 45,
          category_id: null,
          is_included: false,
          recipient: "Refund",
          title: "Refund",
          transaction_date: "2026-05-04",
          created_at: "2026-05-04T00:00:00.000Z",
          updated_at: "2026-05-04T00:00:00.000Z",
        },
        {
          id: "tx-may-excluded-zero",
          user_id: "user-1",
          import_batch_id: "batch-may-reviewed",
          amount: 0,
          category_id: null,
          is_included: false,
          recipient: "Adjustment",
          title: "Zero adjustment",
          transaction_date: "2026-05-05",
          created_at: "2026-05-05T00:00:00.000Z",
          updated_at: "2026-05-05T00:00:00.000Z",
        },
        {
          id: "tx-may-pending",
          user_id: "user-1",
          import_batch_id: "batch-may-pending",
          amount: -30,
          category_id: "cat-travel",
          is_included: true,
          recipient: "Uber",
          title: "Ride",
          transaction_date: "2026-05-07",
          created_at: "2026-05-07T00:00:00.000Z",
          updated_at: "2026-05-07T00:00:00.000Z",
        },
      ],
      historicalTransactions: [
        {
          id: "tx-apr-travel",
          user_id: "user-1",
          import_batch_id: "batch-apr-reviewed",
          amount: -60,
          category_id: "cat-travel",
          is_included: true,
          recipient: "PKP",
          title: "Train",
          transaction_date: "2026-04-11",
          created_at: "2026-04-11T00:00:00.000Z",
          updated_at: "2026-04-11T00:00:00.000Z",
        },
        {
          id: "tx-may-excluded-history",
          user_id: "user-1",
          import_batch_id: "batch-may-reviewed",
          amount: -25,
          category_id: "cat-travel",
          is_included: false,
          recipient: "Old transfer",
          title: "Internal transfer",
          transaction_date: "2026-05-06",
          created_at: "2026-05-06T00:00:00.000Z",
          updated_at: "2026-05-06T00:00:00.000Z",
        },
      ],
    });

    const summary = await loadDashboardSummary(supabase as never, "user-1", "2026-05-01");
    const snapshot = supabase.__state.monthlySummaryRecord();
    if (!snapshot) {
      throw new Error("Expected monthly summary snapshot to be saved");
    }

    expect(summary.reviewed_categorized_spend).toBe(200);
    expect(summary.reviewed_uncategorized_spend).toBe(0);
    expect(summary.incomplete_review_spend).toBe(30);
    expect(summary.total_imported_spend).toBe(230);
    expect(summary.excluded_outflow).toBe(75);
    expect(summary.excluded_inflow).toBe(45);
    expect(summary.category_rows).toContainEqual(
      expect.objectContaining({
        category_id: "cat-travel",
        carryover_opening: 40,
        carryover_closing: 140,
        reviewed_spend: 0,
      }),
    );
    expect(snapshot.summary_snapshot).toMatchObject({
      excluded_inflow: 45,
      excluded_outflow: 75,
      total_imported_spend: 230,
    });
    expect(snapshot.total_spent).toBe(230);
  });
});

describe("rule matching helpers", () => {
  it("matches title, recipient, and both-field rules with contains semantics", () => {
    const transaction = {
      recipient: "Lidl Warszawa",
      title: "Card payment at Lidl",
    };

    expect(
      ruleMatchesTransaction(
        {
          match_field: "recipient",
          match_text: "lidl",
        },
        transaction,
      ),
    ).toBe(true);
    expect(
      ruleMatchesTransaction(
        {
          match_field: "title",
          match_text: "payment",
        },
        transaction,
      ),
    ).toBe(true);
    expect(
      findMatchingRule(
        [
          {
            id: "rule-1",
            user_id: "user-1",
            match_field: "both",
            match_text: "warszawa card",
            target_category_id: "cat-food",
            created_at: "2026-05-31T12:00:00.000Z",
            updated_at: "2026-05-31T12:00:00.000Z",
          },
        ],
        transaction,
      )?.target_category_id,
    ).toBe("cat-food");
  });
});

describe("summary and rule API routes", () => {
  it("returns a dashboard summary with month metadata", async () => {
    const summaryRoute: typeof import("@/pages/api/dashboard/summary") = await import("@/pages/api/dashboard/summary");
    const supabase = buildSummarySupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await summaryRoute.GET({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/dashboard/summary?month=2026-05"),
    } as never);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { selected_month: string; incomplete_review_spend: number };

    expect(payload.selected_month).toBe("2026-05-01");
    expect(payload.incomplete_review_spend).toBe(30);
  });

  it("rejects invalid selected-month values with the summary JSON error contract", async () => {
    const summaryRoute: typeof import("@/pages/api/dashboard/summary") = await import("@/pages/api/dashboard/summary");
    const supabase = buildSummarySupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const response = await summaryRoute.GET({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/dashboard/summary?month=2026-05-15"),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Month must point to the first day of the month",
      field: "month",
    });
  });

  it("creates, updates, and deletes field-aware rules through the API", async () => {
    const rulesIndexRoute: typeof import("@/pages/api/rules/index") = await import("@/pages/api/rules/index");
    const rulesDetailRoute: typeof import("@/pages/api/rules/[id]") = await import("@/pages/api/rules/[id]");
    const supabase = buildSummarySupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const createResponse = await rulesIndexRoute.POST({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: {},
      redirect: vi.fn(),
      request: new Request("http://localhost/api/rules", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          match_field: "recipient",
          match_text: "Lidl",
          target_category_id: "cat-food",
        }),
      }),
    } as never);

    expect(createResponse.status).toBe(201);

    const updateResponse = await rulesDetailRoute.PATCH({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: { id: "rule-created" },
      redirect: vi.fn(),
      request: new Request("http://localhost/api/rules/rule-created", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          match_field: "title",
          match_text: "Rent",
        }),
      }),
    } as never);

    expect(updateResponse.status).toBe(200);

    const deleteResponse = await rulesDetailRoute.DELETE({
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      params: { id: "rule-created" },
      redirect: vi.fn(),
      request: new Request("http://localhost/api/rules/rule-created", {
        method: "DELETE",
      }),
    } as never);

    expect(deleteResponse.status).toBe(200);
  });
});

describe("summary UI", () => {
  it("renders the incomplete-review warning and imports guidance", () => {
    const markup = renderToStaticMarkup(
      createElement(IncompleteReviewNotice, {
        incompleteReviewSpend: 45.75,
        warningBatches: [
          {
            bank: "revolut",
            id: "batch-pending",
            imported_at: "2026-05-30T12:00:00.000Z",
            review_completed_at: null,
            source_filename: "pending.csv",
          },
        ],
      }),
    );

    expect(markup).toContain("Incomplete imported spend stays separate");
    expect(markup).toContain("/imports");
    expect(markup).toContain("excluded transactions panel");
    expect(markup).toContain("pending.csv");
  });

  it("renders month switching controls and pending-review messaging", () => {
    const markup = renderToStaticMarkup(
      createElement(MonthlySummaryHeader, {
        availableMonths: [
          {
            has_completed_review: true,
            has_income: true,
            has_pending_review: false,
            month: "2026-05-01",
          },
          {
            has_completed_review: true,
            has_income: true,
            has_pending_review: true,
            month: "2026-04-01",
          },
        ],
        hasIncompleteReview: true,
        isRefreshing: false,
        onMonthChange: vi.fn(),
        selectedMonth: "2026-05-01",
        updatedAt: "2026-05-31T12:00:00.000Z",
      }),
    );

    expect(markup).toContain("Dashboard for");
    expect(markup).toContain("Selected month");
    expect(markup).toContain("Some imported spend is still pending review");
    expect(markup).toContain("2026-05");
    expect(markup).toContain("2026-04");
  });

  it("renders a separate excluded-transactions panel without netting inflow and outflow", () => {
    const markup = renderToStaticMarkup(
      createElement(ExcludedTransactionsPanel, {
        excludedInflow: 45,
        excludedOutflow: 75,
      }),
    );

    expect(markup).toContain("Excluded transactions");
    expect(markup).toContain("Imported history kept, budget math removed");
    expect(markup).toContain("Excluded outflow");
    expect(markup).toContain("75.00 PLN");
    expect(markup).toContain("Excluded inflow");
    expect(markup).toContain("45.00 PLN");
  });

  it("keeps category usage copy distinct from uncategorized and excluded buckets", () => {
    const markup = renderToStaticMarkup(
      createElement(CategoryUsageTable, {
        categoryRows: [
          {
            carryover_closing: 0,
            carryover_enabled: false,
            carryover_opening: 0,
            category_id: "cat-food",
            category_name: "Food",
            limit_amount: 200,
            limit_usage_percentage: 50,
            percentage_limit: 20,
            percent_of_income: 10,
            reviewed_spend: 100,
          },
        ],
        reviewedUncategorizedSpend: 25,
      }),
    );

    expect(markup).toContain("Trusted reviewed category totals only");
    expect(markup).toContain("Reviewed uncategorized included spend");
    expect(markup).toContain("excluded transactions are reconciled outside this table");
  });

  it("wires excluded summary fields into the dashboard surface while keeping imported spend separate", () => {
    const markup = renderToStaticMarkup(
      createElement(SummaryWorkspace, {
        categories: [],
        initialRules: [],
        initialSummary: {
          available_months: [
            {
              has_completed_review: true,
              has_income: true,
              has_pending_review: true,
              month: "2026-05-01",
            },
          ],
          category_rows: [],
          excluded_inflow: 45,
          excluded_outflow: 75,
          generated_at: "2026-05-31T12:00:00.000Z",
          incomplete_review_spend: 30,
          reviewed_categorized_spend: 200,
          reviewed_uncategorized_spend: 50,
          selected_month: "2026-05-01",
          summary_id: "summary-1",
          total_imported_spend: 280,
          total_income: 1000,
          warning_batches: [],
        },
      }),
    );

    expect(markup).toContain("Imported spend");
    expect(markup).toContain("280.00 PLN");
    expect(markup).toContain("Excluded transactions");
    expect(markup).toContain("75.00 PLN");
    expect(markup).toContain("45.00 PLN");
  });

  it("renders saved rules in user language with create and delete actions", () => {
    const markup = renderToStaticMarkup(
      createElement(RuleManager, {
        categories: [
          {
            archived_at: null,
            carryover_enabled: false,
            created_at: "2026-04-01T00:00:00.000Z",
            id: "cat-food",
            name: "Food",
            percentage_limit: 20,
            updated_at: "2026-04-01T00:00:00.000Z",
            user_id: "user-1",
          },
        ],
        isBusy: false,
        onCreateRule: vi.fn(() => Promise.resolve()),
        onDeleteRule: vi.fn(() => Promise.resolve()),
        onUpdateRule: vi.fn(() => Promise.resolve()),
        rules: [
          {
            created_at: "2026-05-31T12:00:00.000Z",
            id: "rule-1",
            match_field: "recipient",
            match_text: "Lidl",
            target_category: {
              archived_at: null,
              carryover_enabled: false,
              created_at: "2026-04-01T00:00:00.000Z",
              id: "cat-food",
              name: "Food",
              percentage_limit: 20,
              updated_at: "2026-04-01T00:00:00.000Z",
              user_id: "user-1",
            },
            target_category_id: "cat-food",
            updated_at: "2026-05-31T12:00:00.000Z",
            user_id: "user-1",
          },
        ],
      }),
    );

    expect(markup).toContain("Match");
    expect(markup).toContain("contains");
    expect(markup).toContain("Lidl");
    expect(markup).toContain("Food");
    expect(markup).toContain("Add rule");
    expect(markup).toContain("Delete");
  });
});
