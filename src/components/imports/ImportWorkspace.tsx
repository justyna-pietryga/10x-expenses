import { startTransition, useEffect, useState } from "react";
import type { BudgetCategory } from "@/lib/budget/data";
import type { ImportBatch, ImportBatchHistorySummary, ImportedTransactionReviewRow } from "@/lib/imports/data";
import { ImportHistory, ImportHistoryCollapseButton } from "@/components/imports/ImportHistory";
import { ImportUploadForm, type ImportPreviewPayload } from "@/components/imports/ImportUploadForm";
import { ReviewCompletionBar } from "@/components/imports/ReviewCompletionBar";
import {
  TransactionReviewTable,
  type ImportCategoryDraftUpdate,
  type ImportCategorySaveResult,
  type ImportReviewRuleActionPayload,
  type ImportReviewRuleActionResult,
} from "@/components/imports/TransactionReviewTable";
import { cn } from "@/lib/utils";

const IMPORT_HISTORY_COLLAPSED_STORAGE_KEY = "imports:history-panel-collapsed:v1";

interface Props {
  categories: BudgetCategory[];
  initialBatch: ImportBatch | null;
  initialHistory?: ImportBatchHistorySummary[];
  initialSelectedBatchId?: string | null;
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
  const categoryById = new Map(updates.map((update) => [update.id, update.category_id]));

  return transactions.map((transaction) => {
    const nextCategoryId = categoryById.get(transaction.id);

    if (nextCategoryId === undefined) {
      return transaction;
    }

    return {
      ...transaction,
      category_id: nextCategoryId,
      category_rule: null,
      categorized_by_rule_id: null,
    };
  });
}

export function ImportWorkspace({
  categories,
  initialBatch,
  initialHistory,
  initialSelectedBatchId,
  initialTransactions,
}: Props) {
  const [preview, setPreview] = useState<ImportPreviewPayload | null>(null);
  const [batch, setBatch] = useState(initialBatch);
  const history = initialHistory ?? [];
  const [transactions, setTransactions] = useState(initialTransactions);
  const [error, setError] = useState<string | null>(null);
  const [hasDirtyCategoryChanges, setHasDirtyCategoryChanges] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDesktopHistoryCollapsed, setIsDesktopHistoryCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedValue = window.localStorage.getItem(IMPORT_HISTORY_COLLAPSED_STORAGE_KEY);

    if (storedValue === "true") {
      const frameId = window.requestAnimationFrame(() => {
        setIsDesktopHistoryCollapsed(true);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }
  }, []);

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
            ? "Some category changes were saved, and some still need attention."
            : "Category changes saved.",
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
    if (!batch || hasDirtyCategoryChanges) {
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

      <div className="lg:hidden">
        <ImportHistory activeBatchId={batch?.id ?? initialSelectedBatchId ?? null} history={history} />
      </div>

      <div className="space-y-6">
        {history.length > 0 && (
          <div className="hidden justify-end lg:flex">
            <ImportHistoryCollapseButton
              collapsed={isDesktopHistoryCollapsed}
              onToggle={() => {
                setIsDesktopHistoryCollapsed((current) => {
                  const nextValue = !current;

                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(IMPORT_HISTORY_COLLAPSED_STORAGE_KEY, String(nextValue));
                  }

                  return nextValue;
                });
              }}
            />
          </div>
        )}

        <div
          className={cn(
            "space-y-6",
            history.length > 0 &&
              !isDesktopHistoryCollapsed &&
              "lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0",
          )}
        >
          {history.length > 0 && !isDesktopHistoryCollapsed && (
            <div className="hidden min-w-0 lg:block">
              <ImportHistory activeBatchId={batch?.id ?? initialSelectedBatchId ?? null} history={history} />
            </div>
          )}

          <div className="min-w-0 space-y-6">
            {batch ? (
              <>
                <ReviewCompletionBar
                  batch={batch}
                  completionBlockedReason={
                    hasDirtyCategoryChanges
                      ? "Save or discard category changes before marking this review complete."
                      : null
                  }
                  isCompletionBlocked={hasDirtyCategoryChanges}
                  transactionCount={transactions.length}
                  onComplete={handleCompleteReview}
                />
                <TransactionReviewTable
                  categories={categories}
                  onCreateRuleFromReview={handleCreateRuleFromReview}
                  onDirtyStateChange={setHasDirtyCategoryChanges}
                  onSaveCategoryChanges={handleSaveCategoryChanges}
                  transactions={transactions}
                />
              </>
            ) : (
              <section className="rounded-[28px] border border-dashed border-white/15 bg-white/5 px-6 py-10 text-center text-sm text-slate-300">
                {history.length > 0 ? (
                  <>
                    <p className="font-medium text-white">No active review is loaded yet.</p>
                    <p className="mt-2 text-slate-300/80">
                      Open a batch from recent history or upload a new supported CSV above to start the next review.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-white">Choose a supported bank and upload your first statement.</p>
                    <p className="mt-2 text-slate-300/80">
                      Your recent import history will appear here after the first batch is saved.
                    </p>
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
