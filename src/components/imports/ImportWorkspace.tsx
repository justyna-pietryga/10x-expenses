import { startTransition, useState } from "react";
import type { BudgetCategory } from "@/lib/budget/data";
import type { ImportBatch, ImportedTransactionReviewRow } from "@/lib/imports/data";
import { ImportUploadForm, type ImportPreviewPayload } from "@/components/imports/ImportUploadForm";
import { ReviewCompletionBar } from "@/components/imports/ReviewCompletionBar";
import {
  TransactionReviewTable,
  type ImportCategoryDraftUpdate,
  type ImportCategorySaveResult,
  type ImportReviewRuleActionPayload,
  type ImportReviewRuleActionResult,
} from "@/components/imports/TransactionReviewTable";

interface Props {
  categories: BudgetCategory[];
  initialBatch: ImportBatch | null;
  initialTransactions: ImportedTransactionReviewRow[];
}

interface CommitPayload {
  batch: ImportBatch;
  replaced: boolean;
  transactions: ImportedTransactionReviewRow[];
}

interface BulkCategorySaveResponse extends ImportCategorySaveResult {
  error?: string;
}

interface CreateReviewRuleResponse extends ImportReviewRuleActionResult {
  error?: string;
}

export async function saveImportCategoryChanges(
  updates: ImportCategoryDraftUpdate[],
  fetchFn: typeof fetch = fetch,
): Promise<ImportCategorySaveResult> {
  const response = await fetchFn("/api/imports/transactions/bulk", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ updates }),
  });
  const payload = (await response.json()) as BulkCategorySaveResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not save these category changes");
  }

  return {
    failed: payload.failed,
    updated: payload.updated,
  };
}

export async function createImportReviewRule(
  payload: ImportReviewRuleActionPayload,
  fetchFn: typeof fetch = fetch,
): Promise<ImportReviewRuleActionResult> {
  const response = await fetchFn("/api/imports/transactions/rule", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as CreateReviewRuleResponse;

  if (!response.ok) {
    throw new Error(body.error ?? "Could not save this review rule");
  }

  return body;
}

export function mergeImportedTransactions(
  transactions: ImportedTransactionReviewRow[],
  updates: ImportedTransactionReviewRow[],
) {
  const updateById = new Map(updates.map((update) => [update.id, update]));

  return transactions.map((transaction) => {
    const nextTransaction = updateById.get(transaction.id);

    if (!nextTransaction) {
      return transaction;
    }

    return {
      ...transaction,
      ...nextTransaction,
    };
  });
}

export function mergeImportedTransactionCategoryUpdates(
  transactions: ImportedTransactionReviewRow[],
  updates: ImportCategorySaveResult["updated"],
) {
  const updateById = new Map(updates.map((update) => [update.id, update]));

  return transactions.map((transaction) => {
    const nextUpdate = updateById.get(transaction.id);

    if (!nextUpdate) {
      return transaction;
    }

    return {
      ...transaction,
      category_id: nextUpdate.category_id,
      inclusion_status: nextUpdate.inclusion_status,
      category_rule: null,
      categorized_by_rule_id: null,
    };
  });
}

export function ImportWorkspace({ categories, initialBatch, initialTransactions }: Props) {
  const [preview, setPreview] = useState<ImportPreviewPayload | null>(null);
  const [batch, setBatch] = useState(initialBatch);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [error, setError] = useState<string | null>(null);
  const [hasDirtyReviewChanges, setHasDirtyReviewChanges] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);

  async function handleCommit(confirmReplace: boolean) {
    if (!preview) {
      return;
    }

    setIsCommitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/imports/commit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          bank: preview.bank,
          confirm_replace: confirmReplace,
          period_end: preview.period_end,
          period_start: preview.period_start,
          source_filename: preview.source_filename,
          statement_month: preview.statement_month,
          transactions: preview.transactions,
        }),
      });
      const payload = (await response.json()) as CommitPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save this import batch");
      }

      startTransition(() => {
        setBatch(payload.batch);
        setTransactions(payload.transactions);
        setPreview(null);
        setNotice(
          payload.replaced
            ? "Existing batch replaced. Review the new transactions below."
            : "Import batch saved. Review the transactions below.",
        );
      });
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Could not save this import batch");
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleSaveCategoryChanges(updates: ImportCategoryDraftUpdate[]): Promise<ImportCategorySaveResult> {
    const result = await saveImportCategoryChanges(updates);

    if (result.updated.length > 0) {
      startTransition(() => {
        setTransactions((current) => mergeImportedTransactionCategoryUpdates(current, result.updated));
        setNotice(
          result.failed.length > 0
            ? "Some review changes were saved, and some still need attention."
            : "Review changes saved.",
        );
      });
    }

    return result;
  }

  async function handleCreateRuleFromReview(
    payload: ImportReviewRuleActionPayload,
  ): Promise<ImportReviewRuleActionResult> {
    const result = await createImportReviewRule(payload);
    const updates = [result.anchor_transaction, ...result.applied_transactions];

    startTransition(() => {
      setTransactions((current) => mergeImportedTransactions(current, updates));
      setNotice(
        payload.apply_now
          ? result.applied_transactions.length > 0
            ? `Rule saved and applied to ${result.applied_transactions.length} current-batch row${result.applied_transactions.length === 1 ? "" : "s"}.`
            : "Rule saved. No additional persisted rows needed updates."
          : `Rule saved. ${result.match_count} additional matching row${result.match_count === 1 ? "" : "s"} available in this batch.`,
      );
    });

    return result;
  }

  async function handleCompleteReview() {
    if (!batch || hasDirtyReviewChanges) {
      return;
    }

    const response = await fetch(`/api/imports/batches/${batch.id}/complete`, {
      method: "POST",
    });
    const payload = (await response.json()) as { batch?: ImportBatch; error?: string };

    if (!response.ok || !payload.batch) {
      throw new Error(payload.error ?? "Could not mark this review complete");
    }

    startTransition(() => {
      setBatch(payload.batch ?? null);
      setNotice("Review marked complete.");
    });
  }

  return (
    <div className="space-y-6">
      <ImportUploadForm
        isCommitting={isCommitting}
        preview={preview}
        onPreviewLoaded={(nextPreview) => {
          setPreview(nextPreview);
          setError(null);
          setNotice(
            nextPreview.existing_batch
              ? "Existing monthly batch detected. Confirm replacement to continue."
              : "Preview ready. Save the batch to start review.",
          );
        }}
        onCommitRequested={handleCommit}
      />

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {notice && <p className="text-sm text-emerald-200">{notice}</p>}

      {categories.length === 0 && (
        <div className="rounded-3xl border border-amber-300/25 bg-amber-300/10 px-5 py-4 text-sm text-amber-50">
          No active budget categories are configured yet. You can still import now and categorize later, or return to
          <a href="/budget" className="ml-1 underline underline-offset-4">
            budget setup
          </a>
          .
        </div>
      )}

      {batch ? (
        <div className="space-y-6">
          <ReviewCompletionBar
            batch={batch}
            completionBlockedReason={
              hasDirtyReviewChanges ? "Save or discard review changes before marking this review complete." : null
            }
            isCompletionBlocked={hasDirtyReviewChanges}
            transactionCount={transactions.length}
            onComplete={handleCompleteReview}
          />
          <TransactionReviewTable
            categories={categories}
            onCreateRuleFromReview={handleCreateRuleFromReview}
            onDirtyStateChange={setHasDirtyReviewChanges}
            onSaveCategoryChanges={handleSaveCategoryChanges}
            transactions={transactions}
          />
        </div>
      ) : (
        <section className="rounded-[28px] border border-dashed border-white/15 bg-white/5 px-6 py-10 text-center text-sm text-slate-300">
          Choose a supported bank and upload its CSV preview above to create the first review batch.
        </section>
      )}
    </div>
  );
}
