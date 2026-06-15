import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BudgetCategory } from "@/lib/budget/data";
import {
  findDefaultImportBatchId,
  type ImportBatch,
  type ImportBatchHistorySummary,
  type ImportedTransactionReviewRow,
} from "@/lib/imports/data";
import { ImportHistory, ImportHistoryCollapseButton } from "@/components/imports/ImportHistory";
import { ImportUploadForm, type ImportPreviewPayload } from "@/components/imports/ImportUploadForm";
import { ReviewCompletionBar } from "@/components/imports/ReviewCompletionBar";
import {
  TransactionReviewTable,
  type ImportReviewDraftUpdate,
  type ImportReviewPendingChangesControls,
  type ImportReviewRuleActionPayload,
  type ImportReviewRuleActionResult,
  type ImportReviewSaveResult,
} from "@/components/imports/TransactionReviewTable";
import { Button } from "@/components/ui/button";
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

interface BulkReviewSaveResponse extends ImportReviewSaveResult {
  error?: string;
}

interface CreateReviewRuleResponse extends ImportReviewRuleActionResult {
  error?: string;
}

interface ImportBatchReviewResponse {
  batch: ImportBatch;
  error?: string;
  transactions: ImportedTransactionReviewRow[];
}

type HistorySyncMode = "none" | "push" | "replace";

export function buildImportWorkspaceDesktopLayoutClasses(hasHistory: boolean, isDesktopHistoryCollapsed: boolean) {
  if (!hasHistory || isDesktopHistoryCollapsed) {
    return "space-y-6";
  }

  return "space-y-6 xl:grid xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-start xl:gap-8 xl:space-y-0 2xl:grid-cols-[22rem_minmax(0,1fr)]";
}

export async function saveImportReviewChanges(
  updates: ImportReviewDraftUpdate[],
  fetchFn: typeof fetch = fetch,
): Promise<ImportReviewSaveResult> {
  const response = await fetchFn("/api/imports/transactions/bulk", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ updates }),
  });
  const payload = (await response.json()) as BulkReviewSaveResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not save these review changes");
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

export function mergeImportedTransactionReviewUpdates(
  transactions: ImportedTransactionReviewRow[],
  updates: ImportReviewSaveResult["updated"],
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
      category_rule: nextTransaction.categorized_by_rule_id ? transaction.category_rule : null,
    };
  });
}

export function buildImportHistorySummary(batch: ImportBatch, transactionCount: number): ImportBatchHistorySummary {
  return {
    bank: batch.bank,
    id: batch.id,
    imported_at: batch.imported_at,
    review_completed_at: batch.review_completed_at,
    source_filename: batch.source_filename,
    statement_month: batch.statement_month,
    transaction_count: transactionCount,
  };
}

export function reconcileImportHistory(
  history: ImportBatchHistorySummary[],
  batch: ImportBatch,
  transactionCount: number,
): ImportBatchHistorySummary[] {
  const nextHistory = [
    ...history.filter((item) => item.id !== batch.id),
    buildImportHistorySummary(batch, transactionCount),
  ];

  return nextHistory.sort((a, b) => {
    const aPending = a.review_completed_at ? 1 : 0;
    const bPending = b.review_completed_at ? 1 : 0;

    if (aPending !== bPending) {
      return aPending - bPending;
    }

    return b.statement_month.localeCompare(a.statement_month) || b.imported_at.localeCompare(a.imported_at);
  });
}

export function buildImportWorkspaceUrl(
  batchId: string | null,
  locationLike: Pick<Location, "hash" | "pathname" | "search">,
) {
  const searchParams = new URLSearchParams(locationLike.search);

  if (batchId) {
    searchParams.set("batch", batchId);
  } else {
    searchParams.delete("batch");
  }

  const query = searchParams.toString();

  return `${locationLike.pathname}${query ? `?${query}` : ""}${locationLike.hash}`;
}

export async function loadImportBatchReviewFromApi(batchId: string, fetchFn: typeof fetch = fetch) {
  const response = await fetchFn(`/api/imports/batches/${batchId}`);
  const payload = (await response.json()) as ImportBatchReviewResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not open this import batch");
  }

  return payload;
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
  const [history, setHistory] = useState(initialHistory ?? []);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [error, setError] = useState<string | null>(null);
  const [hasDirtyReviewChanges, setHasDirtyReviewChanges] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDesktopHistoryCollapsed, setIsDesktopHistoryCollapsed] = useState(false);
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [isSavingBeforeSwitch, setIsSavingBeforeSwitch] = useState(false);
  const [pendingSwitchBatchId, setPendingSwitchBatchId] = useState<string | null>(null);
  const reviewControlsRef = useRef<ImportReviewPendingChangesControls | null>(null);
  const activeLoadRequestRef = useRef(0);
  const activeBatchId = batch?.id ?? initialSelectedBatchId ?? null;
  const portalTarget = typeof document === "undefined" ? null : document.body;
  const commitBlockedReason = hasDirtyReviewChanges
    ? "Save or discard unsaved review changes before saving another import batch."
    : null;

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

  const syncWorkspaceUrl = useCallback((batchId: string | null, mode: Exclude<HistorySyncMode, "none">) => {
    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = buildImportWorkspaceUrl(batchId, window.location);

    if (mode === "push") {
      window.history.pushState({}, "", nextUrl);
      return;
    }

    window.history.replaceState({}, "", nextUrl);
  }, []);

  const loadBatchIntoWorkspace = useCallback(
    async (
      batchId: string,
      options?: {
        failureMessage?: string;
        successNotice?: string | null;
        syncUrl?: HistorySyncMode;
      },
    ) => {
      const requestId = activeLoadRequestRef.current + 1;
      activeLoadRequestRef.current = requestId;
      setIsLoadingBatch(true);
      setError(null);

      try {
        const payload = await loadImportBatchReviewFromApi(batchId);

        if (activeLoadRequestRef.current !== requestId) {
          return false;
        }

        startTransition(() => {
          setBatch(payload.batch);
          setTransactions(payload.transactions);
          setNotice(options?.successNotice ?? null);
        });

        if (options?.syncUrl === "push" || options?.syncUrl === "replace") {
          syncWorkspaceUrl(payload.batch.id, options.syncUrl);
        }

        return true;
      } catch (loadError) {
        if (activeLoadRequestRef.current !== requestId) {
          return false;
        }

        setError(
          options?.failureMessage ??
            (loadError instanceof Error ? loadError.message : "Could not open this import batch"),
        );
        return false;
      } finally {
        if (activeLoadRequestRef.current === requestId) {
          setIsLoadingBatch(false);
        }
      }
    },
    [syncWorkspaceUrl],
  );

  async function requestBatchSwitch(nextBatchId: string) {
    if (nextBatchId === activeBatchId || isLoadingBatch || isSavingBeforeSwitch) {
      return false;
    }

    if (hasDirtyReviewChanges) {
      setPendingSwitchBatchId(nextBatchId);
      return true;
    }

    return loadBatchIntoWorkspace(nextBatchId, {
      failureMessage: "Could not open the selected import batch.",
      syncUrl: "push",
    });
  }

  async function handleCommit(confirmReplace: boolean) {
    if (!preview) {
      return;
    }

    if (hasDirtyReviewChanges) {
      setNotice("Save or discard unsaved review changes before saving another import batch.");
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
        setHistory((current) => reconcileImportHistory(current, payload.batch, payload.transactions.length));
        setHasDirtyReviewChanges(false);
        setPendingSwitchBatchId(null);
        setTransactions(payload.transactions);
        setPreview(null);
        setNotice(
          payload.replaced
            ? "Existing batch replaced. Review the new transactions below."
            : "Import batch saved. Review the transactions below.",
        );
      });

      syncWorkspaceUrl(payload.batch.id, "push");
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Could not save this import batch");
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleSaveReviewChanges(updates: ImportReviewDraftUpdate[]): Promise<ImportReviewSaveResult> {
    const result = await saveImportReviewChanges(updates);

    if (result.updated.length > 0) {
      startTransition(() => {
        setTransactions((current) => mergeImportedTransactionReviewUpdates(current, result.updated));
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
      setHistory((current) =>
        payload.batch ? reconcileImportHistory(current, payload.batch, transactions.length) : current,
      );
      setNotice("Review marked complete.");
    });
  }

  async function handleDiscardAndSwitch() {
    if (!pendingSwitchBatchId || isLoadingBatch || isSavingBeforeSwitch) {
      return;
    }

    reviewControlsRef.current?.discardPendingChanges();
    setHasDirtyReviewChanges(false);
    const nextBatchId = pendingSwitchBatchId;
    setPendingSwitchBatchId(null);
    await loadBatchIntoWorkspace(nextBatchId, {
      failureMessage: "Could not open the selected import batch.",
      syncUrl: "push",
    });
  }

  async function handleSaveAndSwitch() {
    if (!pendingSwitchBatchId || isLoadingBatch || isSavingBeforeSwitch) {
      return;
    }

    setIsSavingBeforeSwitch(true);

    try {
      const savedAllChanges = (await reviewControlsRef.current?.savePendingChanges()) ?? true;

      if (!savedAllChanges) {
        setNotice("Switching stopped because some review changes still need attention.");
        return;
      }

      setHasDirtyReviewChanges(false);
      const nextBatchId = pendingSwitchBatchId;
      setPendingSwitchBatchId(null);
      await loadBatchIntoWorkspace(nextBatchId, {
        failureMessage: "Could not open the selected import batch.",
        syncUrl: "push",
      });
    } finally {
      setIsSavingBeforeSwitch(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handlePopState() {
      const requestedBatchId = new URLSearchParams(window.location.search).get("batch");
      const fallbackBatchId = findDefaultImportBatchId(history);
      const nextBatchId = requestedBatchId ?? fallbackBatchId;

      if (nextBatchId === activeBatchId) {
        return;
      }

      if (!nextBatchId) {
        startTransition(() => {
          setBatch(null);
          setTransactions([]);
          setNotice(null);
        });
        return;
      }

      if (hasDirtyReviewChanges) {
        setNotice("Resolve unsaved review changes before leaving this batch.");
        syncWorkspaceUrl(activeBatchId, "replace");
        return;
      }

      void loadBatchIntoWorkspace(nextBatchId, {
        failureMessage: "Could not open the selected import batch.",
        syncUrl: "none",
      });
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [activeBatchId, hasDirtyReviewChanges, history, loadBatchIntoWorkspace, syncWorkspaceUrl]);

  const historySelectionHandler = isLoadingBatch || isSavingBeforeSwitch ? undefined : requestBatchSwitch;

  return (
    <div className="space-y-6">
      <ImportUploadForm
        commitBlockedReason={commitBlockedReason}
        isCommitBlocked={hasDirtyReviewChanges}
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

      <div className="xl:hidden">
        <ImportHistory activeBatchId={activeBatchId} history={history} onSelectBatch={historySelectionHandler} />
      </div>

      <div className="space-y-6">
        {history.length > 0 && (
          <div className="hidden justify-end xl:flex">
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

        <div className={cn(buildImportWorkspaceDesktopLayoutClasses(history.length > 0, isDesktopHistoryCollapsed))}>
          {history.length > 0 && !isDesktopHistoryCollapsed && (
            <div className="hidden min-w-0 xl:sticky xl:top-6 xl:block">
              <ImportHistory activeBatchId={activeBatchId} history={history} onSelectBatch={historySelectionHandler} />
            </div>
          )}

          <div className="min-w-0 space-y-6 2xl:space-y-8">
            {batch ? (
              <>
                <ReviewCompletionBar
                  batch={batch}
                  completionBlockedReason={
                    hasDirtyReviewChanges
                      ? "Save or discard unsaved review changes before marking this review complete."
                      : null
                  }
                  isCompletionBlocked={hasDirtyReviewChanges}
                  transactionCount={transactions.length}
                  onComplete={handleCompleteReview}
                />
                <TransactionReviewTable
                  key={batch.id}
                  categories={categories}
                  onCreateRuleFromReview={handleCreateRuleFromReview}
                  onDirtyStateChange={setHasDirtyReviewChanges}
                  onReviewControlsReady={(controls) => {
                    reviewControlsRef.current = controls;
                  }}
                  onSaveReviewChanges={handleSaveReviewChanges}
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

      {pendingSwitchBatchId &&
        portalTarget &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="import-switch-dialog-title"
              className="w-full max-w-lg rounded-[28px] border border-white/12 bg-slate-950/95 p-6 shadow-[0_28px_100px_rgba(2,6,23,0.55)]"
            >
              <p className="text-xs font-semibold tracking-[0.24em] text-amber-200/80 uppercase">
                Unsaved review changes
              </p>
              <h2 id="import-switch-dialog-title" className="mt-3 text-2xl font-semibold text-white">
                Switch batches without losing your current edits?
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300/85">
                Save your current review changes before switching, discard them, or stay on this batch and keep editing.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-2xl border border-white/12 text-slate-100 hover:bg-white/8"
                  disabled={isLoadingBatch || isSavingBeforeSwitch}
                  onClick={() => {
                    setPendingSwitchBatchId(null);
                  }}
                >
                  Stay
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-2xl border border-amber-300/30 text-amber-100 hover:bg-amber-300/10"
                  disabled={isLoadingBatch || isSavingBeforeSwitch}
                  onClick={() => {
                    void handleDiscardAndSwitch();
                  }}
                >
                  {isLoadingBatch ? "Switching..." : "Discard and switch"}
                </Button>
                <Button
                  type="button"
                  className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                  disabled={isLoadingBatch || isSavingBeforeSwitch}
                  onClick={() => {
                    void handleSaveAndSwitch();
                  }}
                >
                  {isSavingBeforeSwitch ? "Saving changes..." : isLoadingBatch ? "Switching..." : "Save and switch"}
                </Button>
              </div>
            </div>
          </div>,
          portalTarget,
        )}
    </div>
  );
}
