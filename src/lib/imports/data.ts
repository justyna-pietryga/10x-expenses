import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { listActiveCategories } from "@/lib/budget/data";
import type { Database, Tables } from "@/lib/database.types";
import { ImportError } from "@/lib/imports/errors";
import type {
  ImportCommitPayload,
  ImportReviewRulePayload,
  ImportReviewUpdate,
  ImportReviewUpdatesPayload,
} from "@/lib/imports/validation";
import { findMatchingRule, listRules, ruleMatchesTransaction } from "@/lib/rules/data";

type ImportClient = SupabaseClient<Database>;

export type CategorizationRule = Tables<"categorization_rules">;
export type ImportBatch = Tables<"statement_import_batches">;
export type ImportedTransaction = Tables<"transactions">;
export type ImportTransactionRuleSummary = Pick<
  CategorizationRule,
  "id" | "match_field" | "match_text" | "target_category_id"
>;
export type ImportedTransactionReviewRow = ImportedTransaction & {
  category_rule?: ImportTransactionRuleSummary | null;
};

export interface ImportBatchReview {
  batch: ImportBatch;
  transactions: ImportedTransactionReviewRow[];
}

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

export type ImportBatchHistorySummary = Pick<
  ImportBatch,
  "bank" | "id" | "imported_at" | "review_completed_at" | "source_filename" | "statement_month"
> & {
  transaction_count: number;
};

export interface ImportReviewUpdateFailure {
  error: string;
  transaction_id: string;
}

export type ImportCategoryUpdateFailure = ImportReviewUpdateFailure;

export interface ImportReviewRuleSkippedRow {
  reason: "dirty_draft";
  transaction_id: string;
}

export interface ImportReviewRuleResult {
  anchor_transaction: ImportedTransactionReviewRow;
  applied_transactions: ImportedTransactionReviewRow[];
  match_count: number;
  rule: CategorizationRule;
  skipped_rows: ImportReviewRuleSkippedRow[];
}

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

function findTransactionRule(
  transaction: Pick<ImportedTransaction, "recipient" | "title">,
  rules: CategorizationRule[],
) {
  return findMatchingRule(rules, transaction);
}

function assignRuleDrivenCategory(
  transaction: ImportCommitPayload["transactions"][number],
  rules: CategorizationRule[],
) {
  const rule = findTransactionRule(transaction, rules);

  return {
    category_id: rule?.target_category_id ?? null,
    categorized_by_rule_id: rule?.id ?? null,
  };
}

function toImportRuleSummary(rule: CategorizationRule): ImportTransactionRuleSummary {
  return {
    id: rule.id,
    match_field: rule.match_field,
    match_text: rule.match_text,
    target_category_id: rule.target_category_id,
  };
}

function attachRuleMetadata(
  transactions: ImportedTransaction[],
  rules: CategorizationRule[],
): ImportedTransactionReviewRow[] {
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));

  return transactions.map((transaction) => ({
    ...transaction,
    category_rule: transaction.categorized_by_rule_id
      ? (() => {
          const rule = ruleById.get(transaction.categorized_by_rule_id);
          return rule ? toImportRuleSummary(rule) : null;
        })()
      : null,
  }));
}

type DefaultImportBatchCandidate = Pick<ImportBatch, "id" | "imported_at" | "review_completed_at" | "statement_month">;

export function findDefaultImportBatchId(batches: DefaultImportBatchCandidate[]) {
  if (batches.length === 0) {
    return null;
  }

  const sortedBatches = [...batches].sort(
    (a, b) => b.statement_month.localeCompare(a.statement_month) || b.imported_at.localeCompare(a.imported_at),
  );

  return sortedBatches[0]?.id ?? null;
}

async function listOwnedImportBatchesByCompletionStatus(
  supabase: ImportClient,
  userId: string,
  options: {
    completed: boolean;
    limit: number;
    sortBy: "display" | "imported_at";
  },
) {
  let query = supabase.from("statement_import_batches").select("*").eq("user_id", userId);

  query = options.completed ? query.not("review_completed_at", "is", null) : query.is("review_completed_at", null);

  if (options.sortBy === "display") {
    query = query.order("statement_month", { ascending: false }).order("imported_at", { ascending: false });
  } else {
    query = query.order("imported_at", { ascending: false });
  }

  const { data, error } = await query.limit(options.limit);

  mapPostgrestError(error, "Import batches could not be loaded");

  return (data ?? []) as ImportBatch[];
}

async function loadImportBatchTransactions(
  supabase: ImportClient,
  userId: string,
  batchId: string,
): Promise<ImportedTransactionReviewRow[]> {
  const { data: transactions, error: transactionError } = await supabase
    .from("transactions")
    .select("*")
    .eq("import_batch_id", batchId)
    .eq("user_id", userId)
    .order("transaction_date", { ascending: true });

  mapPostgrestError(transactionError, "Import transactions could not be loaded");
  const rules = await listCategorizationRules(supabase, userId);

  return attachRuleMetadata(transactions ?? [], rules);
}

async function buildImportBatchReview(
  supabase: ImportClient,
  userId: string,
  batch: ImportBatch,
): Promise<ImportBatchReview> {
  return {
    batch,
    transactions: await loadImportBatchTransactions(supabase, userId, batch.id),
  };
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
  const rules = await listRules(supabase, userId);

  return rules.map(({ target_category: _targetCategory, ...rule }) => rule);
}

async function ensureOwnedImportCategory(supabase: ImportClient, userId: string, categoryId: string | null) {
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

function mapTransactionUpdateFailure(error: PostgrestError | null) {
  if (error?.code === "PGRST116") {
    return "Imported transaction was not found";
  }

  return "Imported transaction could not be updated";
}

function buildImportedTransactionRows(
  userId: string,
  batchId: string,
  transactions: ImportCommitPayload["transactions"],
  rules: CategorizationRule[],
) {
  return transactions.map((transaction) => {
    const ruleDrivenCategory = assignRuleDrivenCategory(transaction, rules);

    return {
      amount: transaction.amount,
      category_id: ruleDrivenCategory.category_id,
      categorized_by_rule_id: ruleDrivenCategory.categorized_by_rule_id,
      import_batch_id: batchId,
      recipient: transaction.recipient,
      title: transaction.title,
      transaction_date: transaction.transaction_date,
      user_id: userId,
    };
  });
}

async function restoreImportTransactions(
  supabase: ImportClient,
  transactions: ImportedTransaction[],
  fallbackMessage: string,
) {
  if (transactions.length === 0) {
    return;
  }

  const restoreRows: Database["public"]["Tables"]["transactions"]["Insert"][] = transactions.map((transaction) => ({
    amount: transaction.amount,
    category_id: transaction.category_id,
    categorized_by_rule_id: transaction.categorized_by_rule_id,
    created_at: transaction.created_at,
    id: transaction.id,
    import_batch_id: transaction.import_batch_id,
    recipient: transaction.recipient,
    title: transaction.title,
    transaction_date: transaction.transaction_date,
    updated_at: transaction.updated_at,
    user_id: transaction.user_id,
  }));
  const { error } = await supabase.from("transactions").insert(restoreRows).select();

  mapPostgrestError(error ?? null, fallbackMessage);
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
  const nextTransactions = buildImportedTransactionRows(userId, existingBatch?.id ?? "", payload.transactions, rules);

  if (existingBatch) {
    const { data: previousTransactions, error: previousTransactionsError } = await supabase
      .from("transactions")
      .select("*")
      .eq("import_batch_id", existingBatch.id)
      .eq("user_id", userId)
      .order("transaction_date", { ascending: true });

    mapPostgrestError(previousTransactionsError, "Previous batch transactions could not be loaded");

    const deleteResult = await supabase
      .from("transactions")
      .delete()
      .eq("import_batch_id", existingBatch.id)
      .eq("user_id", userId);

    mapPostgrestError(deleteResult.error ?? null, "Previous batch transactions could not be replaced");

    try {
      const { data: insertedTransactions, error: transactionError } = await supabase
        .from("transactions")
        .insert(nextTransactions.map((transaction) => ({ ...transaction, import_batch_id: existingBatch.id })))
        .select();

      mapPostgrestError(transactionError, "Imported transactions could not be saved");

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

      return {
        batch,
        replaced: true,
        transactions: insertedTransactions ?? [],
      };
    } catch (error) {
      const cleanupResult = await supabase
        .from("transactions")
        .delete()
        .eq("import_batch_id", existingBatch.id)
        .eq("user_id", userId);

      mapPostgrestError(cleanupResult.error ?? null, "Failed to clean up a partial replacement");
      await restoreImportTransactions(
        supabase,
        previousTransactions ?? [],
        "Previous batch transactions could not be restored after a failed replacement",
      );

      throw error;
    }
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
    .insert(nextTransactions.map((transaction) => ({ ...transaction, import_batch_id: batch.id })))
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

  if (!batch) {
    throw new ImportError("Import batch was not found", { status: 404 });
  }

  return buildImportBatchReview(supabase, userId, batch);
}

export async function listImportBatchHistory(
  supabase: ImportClient,
  userId: string,
  options?: { limit?: number },
): Promise<ImportBatchHistorySummary[]> {
  const limit = options?.limit ?? 50;

  if (limit <= 0) {
    return [];
  }

  const pendingBatches = await listOwnedImportBatchesByCompletionStatus(supabase, userId, {
    completed: false,
    limit,
    sortBy: "display",
  });
  const remainingLimit = limit - pendingBatches.length;
  const completedBatches =
    remainingLimit > 0
      ? await listOwnedImportBatchesByCompletionStatus(supabase, userId, {
          completed: true,
          limit: remainingLimit,
          sortBy: "display",
        })
      : [];
  const orderedBatches = [...pendingBatches, ...completedBatches];

  if (orderedBatches.length === 0) {
    return [];
  }

  const batchIds = orderedBatches.map((batch) => batch.id);
  const { data: transactions, error: transactionError } = await supabase
    .from("transactions")
    .select("import_batch_id")
    .eq("user_id", userId)
    .in("import_batch_id", batchIds)
    .order("transaction_date", { ascending: true });

  mapPostgrestError(transactionError, "Import transactions could not be loaded");

  const transactionCountByBatchId = new Map<string, number>();

  for (const transaction of (transactions ?? []) as Pick<ImportedTransaction, "import_batch_id">[]) {
    transactionCountByBatchId.set(
      transaction.import_batch_id,
      (transactionCountByBatchId.get(transaction.import_batch_id) ?? 0) + 1,
    );
  }

  return orderedBatches.map((batch) => ({
    bank: batch.bank,
    id: batch.id,
    imported_at: batch.imported_at,
    review_completed_at: batch.review_completed_at,
    source_filename: batch.source_filename,
    statement_month: batch.statement_month,
    transaction_count: transactionCountByBatchId.get(batch.id) ?? 0,
  }));
}

export async function loadDefaultImportBatchReview(supabase: ImportClient, userId: string) {
  const [pendingBatches, completedBatches] = await Promise.all([
    listOwnedImportBatchesByCompletionStatus(supabase, userId, {
      completed: false,
      limit: 50,
      sortBy: "display",
    }),
    listOwnedImportBatchesByCompletionStatus(supabase, userId, {
      completed: true,
      limit: 50,
      sortBy: "display",
    }),
  ]);
  const defaultBatchId = findDefaultImportBatchId([...pendingBatches, ...completedBatches]);

  if (!defaultBatchId) {
    return null;
  }

  return loadImportBatchReview(supabase, userId, defaultBatchId);
}

export async function loadLatestImportBatchReview(supabase: ImportClient, userId: string) {
  return loadDefaultImportBatchReview(supabase, userId);
}

function buildReviewUpdateValues(update: Pick<ImportReviewUpdate, "category_id" | "is_included">) {
  if (!update.is_included) {
    return {
      category_id: null,
      categorized_by_rule_id: null,
      is_included: false,
    };
  }

  return {
    category_id: update.category_id,
    categorized_by_rule_id: null,
    is_included: true,
  };
}

export async function updateTransactionReviewAndMaybeRule(
  supabase: ImportClient,
  userId: string,
  reviewUpdate: ImportReviewUpdate,
  options?: { saveRule?: boolean },
) {
  if (reviewUpdate.is_included && reviewUpdate.category_id) {
    await ensureOwnedImportCategory(supabase, userId, reviewUpdate.category_id);
  }

  if (options?.saveRule && !reviewUpdate.is_included) {
    throw new ImportError("Excluded transactions cannot create rules", {
      status: 400,
      field: "save_rule",
    });
  }

  const { data: transaction, error } = await supabase
    .from("transactions")
    .update(buildReviewUpdateValues(reviewUpdate))
    .eq("id", reviewUpdate.transaction_id)
    .eq("user_id", userId)
    .select()
    .single();

  mapPostgrestError(error, "Imported transaction was not found");

  if (!transaction) {
    throw new ImportError("Imported transaction was not found", { status: 404 });
  }

  let rule: CategorizationRule | null = null;

  if (options?.saveRule) {
    if (!reviewUpdate.category_id) {
      throw new ImportError("A category is required before saving a rule", {
        status: 400,
        field: "category_id",
      });
    }

    const { data, error: ruleError } = await supabase
      .from("categorization_rules")
      .upsert(
        {
          match_field: "recipient",
          match_text: transaction.recipient,
          target_category_id: reviewUpdate.category_id,
          user_id: userId,
        },
        {
          onConflict: "user_id,match_field,match_text",
        },
      )
      .select()
      .single();

    mapPostgrestError(ruleError, "Categorization rule could not be saved");

    if (!data) {
      throw new ImportError("Categorization rule could not be saved", { status: 500 });
    }

    rule = data;

    const { data: ruleBackedTransaction, error: transactionRuleError } = await supabase
      .from("transactions")
      .update({
        categorized_by_rule_id: rule.id,
      })
      .eq("id", reviewUpdate.transaction_id)
      .eq("user_id", userId)
      .select()
      .single();

    mapPostgrestError(transactionRuleError, "Imported transaction was not found");

    if (ruleBackedTransaction) {
      transaction.categorized_by_rule_id = ruleBackedTransaction.categorized_by_rule_id;
    }
  }

  return {
    rule,
    transaction,
  };
}

export async function updateImportTransactionReviews(
  supabase: ImportClient,
  userId: string,
  updates: ImportReviewUpdatesPayload["updates"],
) {
  const activeCategories = await listActiveCategories(supabase, userId);
  const activeCategoryIds = new Set(activeCategories.map((category) => category.id));
  const updated: ImportedTransaction[] = [];
  const failed: ImportReviewUpdateFailure[] = [];

  for (const update of updates) {
    if (update.is_included && update.category_id && !activeCategoryIds.has(update.category_id)) {
      failed.push({
        error: "Selected category was not found",
        transaction_id: update.transaction_id,
      });
      continue;
    }

    const { data: transaction, error } = await supabase
      .from("transactions")
      .update(buildReviewUpdateValues(update))
      .eq("id", update.transaction_id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      failed.push({
        error: mapTransactionUpdateFailure(error),
        transaction_id: update.transaction_id,
      });
      continue;
    }

    updated.push(transaction);
  }

  return {
    failed,
    updated,
  };
}

export async function updateTransactionCategoryAndMaybeRule(
  supabase: ImportClient,
  userId: string,
  transactionId: string,
  categoryId: string | null,
  options?: { saveRule?: boolean },
) {
  return updateTransactionReviewAndMaybeRule(
    supabase,
    userId,
    {
      category_id: categoryId,
      is_included: true,
      transaction_id: transactionId,
    },
    options,
  );
}

export async function updateImportTransactionCategories(
  supabase: ImportClient,
  userId: string,
  updates: Pick<ImportReviewUpdate, "category_id" | "transaction_id">[],
) {
  return updateImportTransactionReviews(
    supabase,
    userId,
    updates.map((update) => ({
      ...update,
      is_included: true,
    })),
  );
}

async function loadOwnedTransaction(supabase: ImportClient, userId: string, transactionId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .single();

  mapPostgrestError(error, "Imported transaction was not found");

  if (!data) {
    throw new ImportError("Imported transaction was not found", { status: 404, field: "transaction_id" });
  }

  return data;
}

async function updateRuleBackedTransaction(
  supabase: ImportClient,
  userId: string,
  transactionId: string,
  categoryId: string,
  ruleId: string,
) {
  const { data, error } = await supabase
    .from("transactions")
    .update({
      category_id: categoryId,
      categorized_by_rule_id: ruleId,
    })
    .eq("id", transactionId)
    .eq("user_id", userId)
    .select()
    .single();

  mapPostgrestError(error, "Imported transaction was not found");

  if (!data) {
    throw new ImportError("Imported transaction was not found", { status: 404, field: "transaction_id" });
  }

  return data;
}

export async function createImportReviewRule(
  supabase: ImportClient,
  userId: string,
  payload: ImportReviewRulePayload,
): Promise<ImportReviewRuleResult> {
  if (!payload.category_id) {
    throw new ImportError("A category is required before saving a rule", {
      status: 400,
      field: "category_id",
    });
  }

  await ensureOwnedImportCategory(supabase, userId, payload.category_id);

  const anchorTransaction = await loadOwnedTransaction(supabase, userId, payload.transaction_id);

  const { data: rule, error: ruleError } = await supabase
    .from("categorization_rules")
    .upsert(
      {
        match_field: payload.match_field,
        match_text: payload.match_text,
        target_category_id: payload.category_id,
        user_id: userId,
      },
      {
        onConflict: "user_id,match_field,match_text",
      },
    )
    .select()
    .single();

  mapPostgrestError(ruleError, "Categorization rule could not be saved");

  if (!rule) {
    throw new ImportError("Categorization rule could not be saved", { status: 500 });
  }

  const savedAnchor = await updateRuleBackedTransaction(
    supabase,
    userId,
    anchorTransaction.id,
    payload.category_id,
    rule.id,
  );

  const { data: batchTransactions, error: batchTransactionsError } = await supabase
    .from("transactions")
    .select("*")
    .eq("import_batch_id", anchorTransaction.import_batch_id)
    .eq("user_id", userId)
    .order("transaction_date", { ascending: true });

  mapPostgrestError(batchTransactionsError, "Import transactions could not be loaded");

  const dirtyIds = new Set(payload.dirty_transaction_ids.filter((transactionId) => transactionId !== savedAnchor.id));
  const matchingTransactions = (batchTransactions ?? []).filter(
    (transaction) =>
      transaction.id !== savedAnchor.id && transaction.is_included && ruleMatchesTransaction(rule, transaction),
  );
  const appliedTransactions: ImportedTransaction[] = [];
  const skippedRows: ImportReviewRuleSkippedRow[] = [];

  if (payload.apply_now) {
    for (const transaction of matchingTransactions) {
      if (dirtyIds.has(transaction.id)) {
        skippedRows.push({
          reason: "dirty_draft",
          transaction_id: transaction.id,
        });
        continue;
      }

      const updatedTransaction = await updateRuleBackedTransaction(
        supabase,
        userId,
        transaction.id,
        payload.category_id,
        rule.id,
      );
      appliedTransactions.push(updatedTransaction);
    }
  } else {
    matchingTransactions.forEach((transaction) => {
      if (dirtyIds.has(transaction.id)) {
        skippedRows.push({
          reason: "dirty_draft",
          transaction_id: transaction.id,
        });
      }
    });
  }

  return {
    anchor_transaction: attachRuleMetadata([savedAnchor], [rule])[0],
    applied_transactions: attachRuleMetadata(appliedTransactions, [rule]),
    match_count: matchingTransactions.length,
    rule,
    skipped_rows: skippedRows,
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
