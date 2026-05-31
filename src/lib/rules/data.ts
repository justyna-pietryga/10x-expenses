import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { listActiveCategories, type BudgetCategory } from "@/lib/budget/data";
import type { Database, Tables } from "@/lib/database.types";
import { RuleError } from "@/lib/rules/errors";
import type { RuleMatchField } from "@/lib/rules/validation";

type RulesClient = SupabaseClient<Database>;

export type CategorizationRule = Tables<"categorization_rules">;
export type RuleWithCategory = CategorizationRule & {
  target_category: BudgetCategory | null;
};

type RuleTransaction = Pick<Tables<"transactions">, "recipient" | "title">;

function mapPostgrestError(error: PostgrestError | null, fallbackMessage: string) {
  if (!error) {
    return;
  }

  if (error.code === "23505") {
    throw new RuleError("A matching rule already exists", {
      status: 409,
      field: "match_text",
    });
  }

  if (error.code === "PGRST116") {
    throw new RuleError(fallbackMessage, { status: 404 });
  }

  throw new RuleError(error.message, { status: 500 });
}

export function normalizeRuleValue(value: string) {
  return value.trim().toLowerCase();
}

export function getMatchCandidate(transaction: RuleTransaction, matchField: RuleMatchField) {
  const recipient = normalizeRuleValue(transaction.recipient);
  const title = normalizeRuleValue(transaction.title);

  if (matchField === "recipient") {
    return recipient;
  }

  if (matchField === "title") {
    return title;
  }

  return `${recipient} ${title}`;
}

export function ruleMatchesTransaction(
  rule: Pick<CategorizationRule, "match_field" | "match_text">,
  transaction: RuleTransaction,
) {
  return getMatchCandidate(transaction, rule.match_field as RuleMatchField).includes(
    normalizeRuleValue(rule.match_text),
  );
}

export function findMatchingRule(rules: CategorizationRule[], transaction: RuleTransaction) {
  return rules.find((rule) => ruleMatchesTransaction(rule, transaction)) ?? null;
}

export async function ensureOwnedCategory(supabase: RulesClient, userId: string, categoryId: string) {
  const categories = await listActiveCategories(supabase, userId);
  const category = categories.find((item) => item.id === categoryId);

  if (!category) {
    throw new RuleError("Selected category was not found", {
      status: 404,
      field: "target_category_id",
    });
  }

  return category;
}

export async function listRules(supabase: RulesClient, userId: string) {
  const [rulesResult, categories] = await Promise.all([
    supabase.from("categorization_rules").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    listActiveCategories(supabase, userId),
  ]);

  mapPostgrestError(rulesResult.error, "Categorization rules could not be loaded");

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return (rulesResult.data ?? []).map((rule) => ({
    ...rule,
    target_category: categoryById.get(rule.target_category_id) ?? null,
  })) satisfies RuleWithCategory[];
}

export async function createRule(
  supabase: RulesClient,
  userId: string,
  input: Pick<CategorizationRule, "match_field" | "match_text" | "target_category_id">,
) {
  await ensureOwnedCategory(supabase, userId, input.target_category_id);

  const { data, error } = await supabase
    .from("categorization_rules")
    .insert({
      match_field: input.match_field,
      match_text: input.match_text,
      target_category_id: input.target_category_id,
      user_id: userId,
    })
    .select()
    .single();

  mapPostgrestError(error, "Categorization rule could not be created");

  return data;
}

export async function updateRule(
  supabase: RulesClient,
  userId: string,
  ruleId: string,
  input: Partial<Pick<CategorizationRule, "match_field" | "match_text" | "target_category_id">>,
) {
  if (input.target_category_id) {
    await ensureOwnedCategory(supabase, userId, input.target_category_id);
  }

  const { data, error } = await supabase
    .from("categorization_rules")
    .update(input)
    .eq("id", ruleId)
    .eq("user_id", userId)
    .select()
    .single();

  mapPostgrestError(error, "Categorization rule was not found");

  return data;
}

export async function deleteRule(supabase: RulesClient, userId: string, ruleId: string) {
  const { data, error } = await supabase
    .from("categorization_rules")
    .delete()
    .eq("id", ruleId)
    .eq("user_id", userId)
    .select()
    .single();

  mapPostgrestError(error, "Categorization rule was not found");

  return data;
}
