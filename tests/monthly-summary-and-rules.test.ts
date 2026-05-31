import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IncompleteReviewNotice } from "@/components/dashboard/IncompleteReviewNotice";
import { MonthlySummaryHeader } from "@/components/dashboard/MonthlySummaryHeader";
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

function buildSummarySupabaseStub() {
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
  const monthlyIncomes = [
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
  const selectedBatches = [
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
  const historicalBatches = [
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
  const selectedTransactions = [
    {
      id: "tx-may-food",
      user_id: "user-1",
      import_batch_id: "batch-may-reviewed",
      amount: -200,
      category_id: "cat-food",
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
      recipient: "Uber",
      title: "Ride",
      transaction_date: "2026-05-07",
      created_at: "2026-05-07T00:00:00.000Z",
      updated_at: "2026-05-07T00:00:00.000Z",
    },
  ];
  const historicalTransactions = [
    {
      id: "tx-apr-travel",
      user_id: "user-1",
      import_batch_id: "batch-apr-reviewed",
      amount: -60,
      category_id: "cat-travel",
      recipient: "PKP",
      title: "Train",
      transaction_date: "2026-04-11",
      created_at: "2026-04-11T00:00:00.000Z",
      updated_at: "2026-04-11T00:00:00.000Z",
    },
    ...selectedTransactions.filter((transaction) => transaction.import_batch_id === "batch-may-reviewed"),
  ];

  return {
    from: vi.fn((table: string) => {
      if (table === "statement_import_batches") {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === "statement_month, review_completed_at") {
              return createSelectChain([
                { statement_month: "2026-05-01", review_completed_at: selectedBatches[0].review_completed_at },
                { statement_month: "2026-05-01", review_completed_at: selectedBatches[1].review_completed_at },
                { statement_month: "2026-04-01", review_completed_at: historicalBatches[0].review_completed_at },
              ]);
            }

            let data = historicalBatches;
            const chain = {
              eq: vi.fn().mockImplementation((field: string, value: string) => {
                if (field === "statement_month" && value === "2026-05-01") {
                  data = selectedBatches;
                }

                return chain;
              }),
              lte: vi.fn().mockImplementation(() => {
                data = historicalBatches;
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
              const data = values.includes("batch-may-pending") ? selectedTransactions : historicalTransactions;
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
          select: vi.fn().mockReturnValue(createSelectChain(null)),
          upsert: vi.fn().mockReturnValue(
            createInsertSingleChain({
              id: "summary-1",
              user_id: "user-1",
              month: "2026-05-01",
              total_income: 1000,
              total_spent: 280,
              generated_at: "2026-05-31T12:00:00.000Z",
              summary_snapshot: {},
              created_at: "2026-05-31T12:00:00.000Z",
              updated_at: "2026-05-31T12:00:00.000Z",
            }),
          ),
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
