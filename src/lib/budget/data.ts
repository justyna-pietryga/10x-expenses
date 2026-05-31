import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { BudgetError } from "@/lib/budget/errors";
import type { Database, Tables } from "@/lib/database.types";

type BudgetClient = SupabaseClient<Database>;

export type BudgetCategory = Tables<"budget_categories">;
export type MonthlyIncome = Tables<"monthly_incomes">;

function mapPostgrestError(error: PostgrestError | null, fallbackMessage: string) {
  if (!error) {
    return;
  }

  if (error.code === "23505") {
    throw new BudgetError("Category name already exists", { status: 409, field: "name" });
  }

  if (error.code === "PGRST116") {
    throw new BudgetError(fallbackMessage, { status: 404 });
  }

  throw new BudgetError(error.message, { status: 500 });
}

export async function listActiveCategories(supabase: BudgetClient, userId: string) {
  const { data, error } = await supabase
    .from("budget_categories")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  mapPostgrestError(error, "Active categories were not found");

  return data ?? [];
}

export async function loadMonthlyIncome(supabase: BudgetClient, userId: string, month: string) {
  const { data, error } = await supabase
    .from("monthly_incomes")
    .select("*")
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle();

  if (error) {
    throw new BudgetError(error.message, { status: 500 });
  }

  return data;
}

export async function upsertMonthlyIncome(
  supabase: BudgetClient,
  userId: string,
  input: Pick<MonthlyIncome, "amount" | "is_estimated" | "month">,
) {
  const { data, error } = await supabase
    .from("monthly_incomes")
    .upsert(
      {
        user_id: userId,
        month: input.month,
        amount: input.amount,
        is_estimated: input.is_estimated,
      },
      {
        onConflict: "user_id,month",
      },
    )
    .select()
    .single();

  mapPostgrestError(error, "Monthly income could not be saved");

  return data;
}

export async function createCategory(
  supabase: BudgetClient,
  userId: string,
  input: Pick<BudgetCategory, "carryover_enabled" | "name" | "percentage_limit">,
) {
  const { data, error } = await supabase
    .from("budget_categories")
    .insert({
      carryover_enabled: input.carryover_enabled,
      user_id: userId,
      name: input.name,
      percentage_limit: input.percentage_limit,
    })
    .select()
    .single();

  mapPostgrestError(error, "Category could not be created");

  return data;
}

export async function updateCategory(
  supabase: BudgetClient,
  userId: string,
  categoryId: string,
  input: Pick<BudgetCategory, "carryover_enabled" | "name" | "percentage_limit">,
) {
  const { data, error } = await supabase
    .from("budget_categories")
    .update({
      carryover_enabled: input.carryover_enabled,
      name: input.name,
      percentage_limit: input.percentage_limit,
    })
    .eq("id", categoryId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .select()
    .single();

  mapPostgrestError(error, "Active category was not found");

  return data;
}

export async function archiveCategory(supabase: BudgetClient, userId: string, categoryId: string) {
  const { data, error } = await supabase
    .from("budget_categories")
    .update({
      archived_at: new Date().toISOString(),
    })
    .eq("id", categoryId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .select()
    .single();

  mapPostgrestError(error, "Active category was not found");

  return data;
}
