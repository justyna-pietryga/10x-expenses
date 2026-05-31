import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { listActiveCategories, loadMonthlyIncome, type BudgetCategory } from "@/lib/budget/data";
import type { Database, Json, Tables } from "@/lib/database.types";
import { SummaryError } from "@/lib/summary/errors";

type SummaryClient = SupabaseClient<Database>;

type ImportBatch = Tables<"statement_import_batches">;
type ImportedTransaction = Tables<"transactions">;
type MonthlyIncome = Tables<"monthly_incomes">;
type MonthlySummary = Tables<"monthly_summaries">;

export interface SummaryMonthOption {
  has_completed_review: boolean;
  has_income: boolean;
  has_pending_review: boolean;
  month: string;
}

export interface CategorySummaryRow {
  carryover_closing: number;
  carryover_enabled: boolean;
  carryover_opening: number;
  category_id: string;
  category_name: string;
  limit_amount: number;
  limit_usage_percentage: number;
  percentage_limit: number;
  percent_of_income: number;
  reviewed_spend: number;
}

export interface MonthlySummaryResult {
  available_months: SummaryMonthOption[];
  generated_at: string;
  incomplete_review_spend: number;
  reviewed_categorized_spend: number;
  reviewed_uncategorized_spend: number;
  selected_month: string;
  summary_id: string | null;
  total_imported_spend: number;
  total_income: number;
  category_rows: CategorySummaryRow[];
  warning_batches: Pick<ImportBatch, "bank" | "id" | "imported_at" | "review_completed_at" | "source_filename">[];
}

type HistoricalSpendByMonth = Partial<Record<string, Map<string, number>>>;

function mapPostgrestError(error: PostgrestError | null, fallbackMessage: string) {
  if (!error) {
    return;
  }

  if (error.code === "PGRST116") {
    throw new SummaryError(fallbackMessage, { status: 404 });
  }

  throw new SummaryError(error.message, { status: 500 });
}

function compareMonthDesc(left: string, right: string) {
  return right.localeCompare(left);
}

function toSpendAmount(amount: number) {
  return amount < 0 ? Number(Math.abs(amount).toFixed(2)) : 0;
}

function toPercentage(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

function toCurrency(value: number) {
  return Number(value.toFixed(2));
}

function buildCarryoverTimeline(
  carryoverCategories: BudgetCategory[],
  months: string[],
  incomeByMonth: Map<string, MonthlyIncome | null>,
  reviewedSpendByMonth: HistoricalSpendByMonth,
) {
  const carryoverState = new Map<string, { closing: number; opening: number }>();
  const timeline = new Map<string, Map<string, { closing: number; opening: number }>>();

  for (const category of carryoverCategories) {
    carryoverState.set(category.id, { opening: 0, closing: 0 });
  }

  for (const month of months) {
    const monthIncome = incomeByMonth.get(month)?.amount ?? 0;
    const monthState = new Map<string, { closing: number; opening: number }>();

    for (const category of carryoverCategories) {
      const previous = carryoverState.get(category.id) ?? { opening: 0, closing: 0 };
      const opening = previous.closing;
      const allowance = monthIncome * (category.percentage_limit / 100);
      const spend = reviewedSpendByMonth[month]?.get(category.id) ?? 0;
      const closing = toCurrency(opening + allowance - spend);

      monthState.set(category.id, {
        closing,
        opening: toCurrency(opening),
      });
      carryoverState.set(category.id, {
        closing,
        opening,
      });
    }

    timeline.set(month, monthState);
  }

  return timeline;
}

export async function listAvailableSummaryMonths(supabase: SummaryClient, userId: string) {
  const [batchesResult, incomeResult] = await Promise.all([
    supabase
      .from("statement_import_batches")
      .select("statement_month, review_completed_at")
      .eq("user_id", userId)
      .order("statement_month", { ascending: false }),
    supabase.from("monthly_incomes").select("month").eq("user_id", userId).order("month", { ascending: false }),
  ]);

  mapPostgrestError(batchesResult.error, "Import batches could not be loaded");
  mapPostgrestError(incomeResult.error, "Monthly incomes could not be loaded");

  const months = new Map<string, SummaryMonthOption>();

  for (const batch of batchesResult.data ?? []) {
    const existing = months.get(batch.statement_month) ?? {
      has_completed_review: false,
      has_income: false,
      has_pending_review: false,
      month: batch.statement_month,
    };

    if (batch.review_completed_at) {
      existing.has_completed_review = true;
    } else {
      existing.has_pending_review = true;
    }

    months.set(batch.statement_month, existing);
  }

  for (const income of incomeResult.data ?? []) {
    const existing = months.get(income.month) ?? {
      has_completed_review: false,
      has_income: false,
      has_pending_review: false,
      month: income.month,
    };

    existing.has_income = true;
    months.set(income.month, existing);
  }

  return Array.from(months.values()).sort((left, right) => compareMonthDesc(left.month, right.month));
}

export function resolveSelectedMonth(requestedMonth: string | null, availableMonths: SummaryMonthOption[]) {
  if (requestedMonth) {
    return requestedMonth;
  }

  const latestImportedMonth = availableMonths.find((month) => month.has_completed_review || month.has_pending_review);
  if (latestImportedMonth) {
    return latestImportedMonth.month;
  }

  if (availableMonths[0]) {
    return availableMonths[0].month;
  }

  return `${new Date().toISOString().slice(0, 7)}-01`;
}

export async function loadDashboardSummary(supabase: SummaryClient, userId: string, requestedMonth: string | null) {
  const availableMonths = await listAvailableSummaryMonths(supabase, userId);
  const selectedMonth = resolveSelectedMonth(requestedMonth, availableMonths);

  const [categories, income, batchesResult, historicalBatchesResult, existingSummaryResult] = await Promise.all([
    listActiveCategories(supabase, userId),
    loadMonthlyIncome(supabase, userId, selectedMonth),
    supabase
      .from("statement_import_batches")
      .select("*")
      .eq("user_id", userId)
      .eq("statement_month", selectedMonth)
      .order("imported_at", { ascending: false }),
    supabase
      .from("statement_import_batches")
      .select("*")
      .eq("user_id", userId)
      .lte("statement_month", selectedMonth)
      .order("statement_month", { ascending: true }),
    supabase.from("monthly_summaries").select("*").eq("user_id", userId).eq("month", selectedMonth).maybeSingle(),
  ]);

  mapPostgrestError(batchesResult.error, "Selected month import batches could not be loaded");
  mapPostgrestError(historicalBatchesResult.error, "Historical import batches could not be loaded");
  mapPostgrestError(existingSummaryResult.error, "Monthly summary could not be loaded");

  const selectedBatches = batchesResult.data ?? [];
  const historicalBatches = historicalBatchesResult.data ?? [];
  const selectedBatchIds = selectedBatches.map((batch) => batch.id);
  const historicalBatchIds = historicalBatches.filter((batch) => batch.review_completed_at).map((batch) => batch.id);

  const [selectedTransactionsResult, historicalTransactionsResult] = await Promise.all([
    selectedBatchIds.length
      ? supabase
          .from("transactions")
          .select("*")
          .eq("user_id", userId)
          .in("import_batch_id", selectedBatchIds)
          .order("transaction_date", { ascending: true })
      : Promise.resolve({ data: [] as ImportedTransaction[], error: null }),
    historicalBatchIds.length
      ? supabase
          .from("transactions")
          .select("*")
          .eq("user_id", userId)
          .in("import_batch_id", historicalBatchIds)
          .order("transaction_date", { ascending: true })
      : Promise.resolve({ data: [] as ImportedTransaction[], error: null }),
  ]);

  mapPostgrestError(selectedTransactionsResult.error, "Selected month transactions could not be loaded");
  mapPostgrestError(historicalTransactionsResult.error, "Historical transactions could not be loaded");

  const selectedTransactions = selectedTransactionsResult.data ?? [];
  const historicalTransactions = historicalTransactionsResult.data ?? [];
  const selectedBatchById = new Map(selectedBatches.map((batch) => [batch.id, batch]));
  const historicalBatchById = new Map(historicalBatches.map((batch) => [batch.id, batch]));

  let reviewedCategorizedSpend = 0;
  let reviewedUncategorizedSpend = 0;
  let incompleteReviewSpend = 0;
  const reviewedSpendByCategory = new Map<string, number>();

  for (const transaction of selectedTransactions) {
    const batch = selectedBatchById.get(transaction.import_batch_id);
    const spendAmount = toSpendAmount(transaction.amount);

    if (!batch || spendAmount === 0) {
      continue;
    }

    if (!batch.review_completed_at) {
      incompleteReviewSpend += spendAmount;
      continue;
    }

    if (transaction.category_id) {
      reviewedCategorizedSpend += spendAmount;
      reviewedSpendByCategory.set(
        transaction.category_id,
        toCurrency((reviewedSpendByCategory.get(transaction.category_id) ?? 0) + spendAmount),
      );
      continue;
    }

    reviewedUncategorizedSpend += spendAmount;
  }

  const reviewedSpendByMonth: HistoricalSpendByMonth = {};

  for (const transaction of historicalTransactions) {
    const batch = historicalBatchById.get(transaction.import_batch_id);
    const spendAmount = toSpendAmount(transaction.amount);

    if (!batch?.review_completed_at || !transaction.category_id || spendAmount === 0) {
      continue;
    }

    const month = batch.statement_month;
    reviewedSpendByMonth[month] ??= new Map<string, number>();
    reviewedSpendByMonth[month].set(
      transaction.category_id,
      toCurrency((reviewedSpendByMonth[month].get(transaction.category_id) ?? 0) + spendAmount),
    );
  }

  const carryoverCategories = categories.filter((category) => category.carryover_enabled);
  const monthsForCarryover = Array.from(
    new Set([...availableMonths.map((month) => month.month), selectedMonth].filter((month) => month <= selectedMonth)),
  ).sort();
  const incomesForCarryover = new Map<string, MonthlyIncome | null>();

  for (const month of monthsForCarryover) {
    incomesForCarryover.set(month, month === selectedMonth ? income : await loadMonthlyIncome(supabase, userId, month));
  }

  const carryoverTimeline = buildCarryoverTimeline(
    carryoverCategories,
    monthsForCarryover,
    incomesForCarryover,
    reviewedSpendByMonth,
  );
  const selectedCarryoverState =
    carryoverTimeline.get(selectedMonth) ?? new Map<string, { closing: number; opening: number }>();
  const totalIncome = income?.amount ?? 0;

  const categoryRows: CategorySummaryRow[] = categories.map((category) => {
    const reviewedSpend = toCurrency(reviewedSpendByCategory.get(category.id) ?? 0);
    const limitAmount = toCurrency(totalIncome * (category.percentage_limit / 100));
    const carryover = selectedCarryoverState.get(category.id) ?? { closing: 0, opening: 0 };

    return {
      carryover_closing: category.carryover_enabled ? carryover.closing : 0,
      carryover_enabled: category.carryover_enabled,
      carryover_opening: category.carryover_enabled ? carryover.opening : 0,
      category_id: category.id,
      category_name: category.name,
      limit_amount: limitAmount,
      limit_usage_percentage: toPercentage(reviewedSpend, limitAmount),
      percentage_limit: category.percentage_limit,
      percent_of_income: toPercentage(reviewedSpend, totalIncome),
      reviewed_spend: reviewedSpend,
    };
  });

  const totalImportedSpend = toCurrency(reviewedCategorizedSpend + reviewedUncategorizedSpend + incompleteReviewSpend);
  const generatedAt = new Date().toISOString();
  const snapshot = {
    category_rows: categoryRows,
    incomplete_review_spend: toCurrency(incompleteReviewSpend),
    reviewed_categorized_spend: toCurrency(reviewedCategorizedSpend),
    reviewed_uncategorized_spend: toCurrency(reviewedUncategorizedSpend),
    selected_month: selectedMonth,
    total_imported_spend: totalImportedSpend,
    total_income: toCurrency(totalIncome),
    warning_batches: selectedBatches
      .filter((batch) => !batch.review_completed_at)
      .map((batch) => ({
        bank: batch.bank,
        id: batch.id,
        imported_at: batch.imported_at,
        review_completed_at: batch.review_completed_at,
        source_filename: batch.source_filename,
      })),
  };

  const upsertResult = await supabase
    .from("monthly_summaries")
    .upsert(
      {
        generated_at: generatedAt,
        month: selectedMonth,
        summary_snapshot: snapshot as unknown as Json,
        total_income: toCurrency(totalIncome),
        total_spent: totalImportedSpend,
        user_id: userId,
      },
      {
        onConflict: "user_id,month",
      },
    )
    .select()
    .single();

  mapPostgrestError(upsertResult.error, "Monthly summary could not be refreshed");

  const savedSummary: MonthlySummary | null = upsertResult.data ?? existingSummaryResult.data;

  return {
    available_months: availableMonths,
    category_rows: categoryRows,
    generated_at: generatedAt,
    incomplete_review_spend: toCurrency(incompleteReviewSpend),
    reviewed_categorized_spend: toCurrency(reviewedCategorizedSpend),
    reviewed_uncategorized_spend: toCurrency(reviewedUncategorizedSpend),
    selected_month: selectedMonth,
    summary_id: savedSummary?.id ?? null,
    total_imported_spend: totalImportedSpend,
    total_income: toCurrency(totalIncome),
    warning_batches: snapshot.warning_batches,
  } satisfies MonthlySummaryResult;
}
