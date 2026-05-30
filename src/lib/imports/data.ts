import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { listActiveCategories } from "@/lib/budget/data";
import type { Database, Tables } from "@/lib/database.types";
import { ImportError } from "@/lib/imports/errors";
import type { ImportCommitPayload } from "@/lib/imports/validation";

type ImportClient = SupabaseClient<Database>;

export type CategorizationRule = Tables<"categorization_rules">;
export type ImportBatch = Tables<"statement_import_batches">;
export type ImportedTransaction = Tables<"transactions">;

export type ExistingImportBatchSummary = Pick<
  ImportBatch,
  | "bank"
  | "id"
  | "imported_at"
  | "period_end"
  | "period_start"
  | "review_completed_at"
  | "source_filename"
  | "statement_month"
>;

function mapPostgrestError(error: PostgrestError | null, fallbackMessage: string) {
  if (!error) {
    return;
  }

  if (error.code === "23505") {
    throw new ImportError(error.message, { status: 409 });
  }

  if (error.code === "PGRST116") {
    throw new ImportError(fallbackMessage, { status: 404 });
  }

  throw new ImportError(error.message, { status: 500 });
}

function normalizeRuleValue(value: string) {
  return value.trim().toLowerCase();
}

function assignCategoryId(transaction: ImportCommitPayload["transactions"][number], rules: CategorizationRule[]) {
  const candidate = normalizeRuleValue(`${transaction.recipient} ${transaction.title}`);
  const matchedRule = rules.find((rule) => candidate.includes(normalizeRuleValue(rule.merchant_pattern)));

  return matchedRule?.target_category_id ?? null;
}

export async function findExistingImportBatch(
  supabase: ImportClient,
  userId: string,
  bank: string,
  statementMonth: string,
) {
  const { data, error } = await supabase
    .from("statement_import_batches")
    .select("*")
    .eq("user_id", userId)
    .eq("bank", bank)
    .eq("statement_month", statementMonth)
    .maybeSingle();

  mapPostgrestError(error, "Import batch was not found");

  return data as ExistingImportBatchSummary | null;
}

export async function listCategorizationRules(supabase: ImportClient, userId: string) {
  const { data, error } = await supabase
    .from("categorization_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  mapPostgrestError(error, "Categorization rules could not be loaded");

  return data ?? [];
}

export async function ensureOwnedCategory(supabase: ImportClient, userId: string, categoryId: string | null) {
  if (!categoryId) {
    return null;
  }

  const categories = await listActiveCategories(supabase, userId);
  const category = categories.find((item) => item.id === categoryId);

  if (!category) {
    throw new ImportError("Selected category was not found", { status: 404, field: "category_id" });
  }

  return category;
}

export async function commitImportBatch(supabase: ImportClient, userId: string, payload: ImportCommitPayload) {
  const existingBatch = await findExistingImportBatch(supabase, userId, payload.bank, payload.statement_month);

  if (existingBatch && !payload.confirm_replace) {
    throw new ImportError("Replacement confirmation is required for this bank and month", {
      status: 409,
      field: "confirm_replace",
    });
  }

  const rules = await listCategorizationRules(supabase, userId);
  let batch: ImportBatch;

  if (existingBatch) {
    const deleteResult = await supabase
      .from("transactions")
      .delete()
      .eq("import_batch_id", existingBatch.id)
      .eq("user_id", userId);

    mapPostgrestError(deleteResult.error ?? null, "Previous batch transactions could not be replaced");

    const { data, error } = await supabase
      .from("statement_import_batches")
      .update({
        imported_at: new Date().toISOString(),
        period_end: payload.period_end,
        period_start: payload.period_start,
        review_completed_at: null,
        source_filename: payload.source_filename,
      })
      .eq("id", existingBatch.id)
      .eq("user_id", userId)
      .select()
      .single();

    mapPostgrestError(error, "Existing import batch could not be updated");
    if (!data) {
      throw new ImportError("Existing import batch could not be updated", { status: 500 });
    }

    batch = data;
  } else {
    const { data, error } = await supabase
      .from("statement_import_batches")
      .insert({
        bank: payload.bank,
        period_end: payload.period_end,
        period_start: payload.period_start,
        review_completed_at: null,
        source_filename: payload.source_filename,
        statement_month: payload.statement_month,
        user_id: userId,
      })
      .select()
      .single();

    mapPostgrestError(error, "Import batch could not be created");
    if (!data) {
      throw new ImportError("Import batch could not be created", { status: 500 });
    }

    batch = data;
  }

  const { data: transactions, error: transactionError } = await supabase
    .from("transactions")
    .insert(
      payload.transactions.map((transaction) => ({
        amount: transaction.amount,
        category_id: assignCategoryId(transaction, rules),
        import_batch_id: batch.id,
        recipient: transaction.recipient,
        title: transaction.title,
        transaction_date: transaction.transaction_date,
        user_id: userId,
      })),
    )
    .select();

  mapPostgrestError(transactionError, "Imported transactions could not be saved");

  return {
    batch,
    replaced: Boolean(existingBatch),
    transactions: transactions ?? [],
  };
}

export async function loadImportBatchReview(supabase: ImportClient, userId: string, batchId: string) {
  const { data: batch, error: batchError } = await supabase
    .from("statement_import_batches")
    .select("*")
    .eq("id", batchId)
    .eq("user_id", userId)
    .single();

  mapPostgrestError(batchError, "Import batch was not found");

  const { data: transactions, error: transactionError } = await supabase
    .from("transactions")
    .select("*")
    .eq("import_batch_id", batchId)
    .eq("user_id", userId)
    .order("transaction_date", { ascending: true });

  mapPostgrestError(transactionError, "Import transactions could not be loaded");

  return {
    batch,
    transactions: transactions ?? [],
  };
}

export async function updateTransactionCategoryAndMaybeRule(
  supabase: ImportClient,
  userId: string,
  transactionId: string,
  categoryId: string | null,
  options?: { saveRule?: boolean },
) {
  await ensureOwnedCategory(supabase, userId, categoryId);

  const { data: transaction, error } = await supabase
    .from("transactions")
    .update({
      category_id: categoryId,
    })
    .eq("id", transactionId)
    .eq("user_id", userId)
    .select()
    .single();

  mapPostgrestError(error, "Imported transaction was not found");

  if (!transaction) {
    throw new ImportError("Imported transaction was not found", { status: 404 });
  }

  let rule: CategorizationRule | null = null;

  if (options?.saveRule) {
    if (!categoryId) {
      throw new ImportError("A category is required before saving a rule", {
        status: 400,
        field: "category_id",
      });
    }

    const { data, error: ruleError } = await supabase
      .from("categorization_rules")
      .upsert(
        {
          merchant_pattern: transaction.recipient,
          target_category_id: categoryId,
          user_id: userId,
        },
        {
          onConflict: "user_id,merchant_pattern",
        },
      )
      .select()
      .single();

    mapPostgrestError(ruleError, "Categorization rule could not be saved");
    rule = data;
  }

  return {
    rule,
    transaction,
  };
}

export async function markBatchReviewComplete(supabase: ImportClient, userId: string, batchId: string) {
  const { data, error } = await supabase
    .from("statement_import_batches")
    .update({
      review_completed_at: new Date().toISOString(),
    })
    .eq("id", batchId)
    .eq("user_id", userId)
    .select()
    .single();

  mapPostgrestError(error, "Import batch was not found");

  return data;
}
