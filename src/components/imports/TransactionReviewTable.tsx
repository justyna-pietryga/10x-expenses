import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BudgetCategory } from "@/lib/budget/data";
import type {
  ImportCategoryUpdateFailure,
  ImportedTransactionReviewRow,
  ImportTransactionRuleSummary,
} from "@/lib/imports/data";
import { ruleMatchesTransaction } from "@/lib/rules/data";
import type { RuleMatchField } from "@/lib/rules/validation";

export interface ImportCategoryDraftUpdate {
  category_id: string | null;
  transaction_id: string;
}

export interface ImportCategorySaveResult {
  failed: ImportCategoryUpdateFailure[];
  updated: { category_id: string | null; id: string }[];
}

export interface ImportReviewRuleDraft {
  category_id: string | null;
  match_field: RuleMatchField;
  match_text: string;
  transaction_id: string;
}

export interface ImportReviewRuleActionPayload extends ImportReviewRuleDraft {
  apply_now: boolean;
  dirty_transaction_ids: string[];
}

export interface ImportReviewRuleActionResult {
  anchor_transaction: ImportedTransactionReviewRow;
  applied_transactions: ImportedTransactionReviewRow[];
  match_count: number;
  rule: ImportTransactionRuleSummary;
  skipped_rows: { reason: "dirty_draft"; transaction_id: string }[];
}

interface Props {
  categories: BudgetCategory[];
  onCreateRuleFromReview: (payload: ImportReviewRuleActionPayload) => Promise<ImportReviewRuleActionResult>;
  onDirtyStateChange?: (hasDirtyChanges: boolean) => void;
  onSaveCategoryChanges: (updates: ImportCategoryDraftUpdate[]) => Promise<ImportCategorySaveResult>;
  transactions: ImportedTransactionReviewRow[];
  initialDrafts?: Partial<Record<string, string>>;
  initialRowErrors?: Partial<Record<string, string>>;
  initialSuccessById?: Partial<Record<string, string>>;
}

function formatAmount(amount: number) {
  return `${amount.toFixed(2)} PLN`;
}

function getCategorySelectValue(categoryId: string | null) {
  return categoryId ?? "";
}

function getRuleBadgeLabel(rule: ImportTransactionRuleSummary | null | undefined) {
  if (!rule) {
    return null;
  }

  if (rule.match_field === "recipient") {
    return `Rule: recipient contains "${rule.match_text}"`;
  }

  if (rule.match_field === "title") {
    return `Rule: title contains "${rule.match_text}"`;
  }

  return `Rule: recipient + title contain "${rule.match_text}"`;
}

function getDraftCategoryId(
  transaction: ImportedTransactionReviewRow,
  drafts: Partial<Record<string, string>>,
  transactionId: string,
) {
  const draftValue = drafts[transactionId];

  if (draftValue === undefined) {
    return transaction.category_id;
  }

  return draftValue === "" ? null : draftValue;
}

export function buildInitialReviewRuleDraft(
  transaction: ImportedTransactionReviewRow,
  drafts: Partial<Record<string, string>> = {},
): ImportReviewRuleDraft {
  return {
    category_id: getDraftCategoryId(transaction, drafts, transaction.id),
    match_field: "recipient",
    match_text: transaction.recipient,
    transaction_id: transaction.id,
  };
}

export function buildReviewRulePreview(
  transactions: ImportedTransactionReviewRow[],
  anchorTransactionId: string,
  draft: ImportReviewRuleDraft | null,
  dirtyUpdates: ImportCategoryDraftUpdate[],
) {
  if (!draft?.category_id || !draft.match_text.trim()) {
    return {
      matchingRowCount: 0,
      skippedDirtyCount: 0,
    };
  }

  const previewRule = {
    match_field: draft.match_field,
    match_text: draft.match_text,
  };

  return transactions.reduce(
    (summary, transaction) => {
      if (transaction.id === anchorTransactionId || !ruleMatchesTransaction(previewRule, transaction)) {
        return summary;
      }

      summary.matchingRowCount += 1;

      if (dirtyUpdates.some((update) => update.transaction_id === transaction.id)) {
        summary.skippedDirtyCount += 1;
      }

      return summary;
    },
    {
      matchingRowCount: 0,
      skippedDirtyCount: 0,
    },
  );
}

export function buildDirtyCategoryUpdates(
  transactions: ImportedTransactionReviewRow[],
  drafts: Partial<Record<string, string>>,
): ImportCategoryDraftUpdate[] {
  return transactions.flatMap((transaction) => {
    const draftValue = drafts[transaction.id];

    if (draftValue === undefined) {
      return [];
    }

    const nextCategoryId = draftValue === "" ? null : draftValue;

    if (transaction.category_id === nextCategoryId) {
      return [];
    }

    return [
      {
        category_id: nextCategoryId,
        transaction_id: transaction.id,
      },
    ];
  });
}

export function buildBulkSaveFeedback(drafts: Partial<Record<string, string>>, result: ImportCategorySaveResult) {
  const nextDrafts = { ...drafts };
  const errorById: Partial<Record<string, string>> = {};
  const successById: Partial<Record<string, string>> = {};

  result.updated.forEach(({ id }) => {
    nextDrafts[id] = undefined;
    successById[id] = "Category saved.";
  });

  result.failed.forEach(({ error, transaction_id: transactionId }) => {
    errorById[transactionId] = error;
  });

  return {
    drafts: nextDrafts,
    errorById,
    successById,
  };
}

export function TransactionReviewTable({
  categories,
  initialDrafts,
  initialRowErrors,
  initialSuccessById,
  onCreateRuleFromReview,
  onDirtyStateChange,
  onSaveCategoryChanges,
  transactions,
}: Props) {
  const [drafts, setDrafts] = useState<Partial<Record<string, string>>>(initialDrafts ?? {});
  const [ruleDraftById, setRuleDraftById] = useState<Partial<Record<string, ImportReviewRuleDraft>>>({});
  const [ruleBusyId, setRuleBusyId] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Partial<Record<string, string>>>(initialRowErrors ?? {});
  const [successById, setSuccessById] = useState<Partial<Record<string, string>>>(initialSuccessById ?? {});
  const dirtyUpdates = buildDirtyCategoryUpdates(transactions, drafts);
  const dirtyCount = dirtyUpdates.length;

  useEffect(() => {
    onDirtyStateChange?.(dirtyCount > 0);
  }, [dirtyCount, onDirtyStateChange]);

  async function handleSaveAllChanges() {
    if (dirtyUpdates.length === 0) {
      return;
    }

    setIsSavingAll(true);
    setError(null);

    try {
      const result = await onSaveCategoryChanges(dirtyUpdates);
      const nextFeedback = buildBulkSaveFeedback(drafts, result);

      setDrafts(nextFeedback.drafts);
      setErrorById(nextFeedback.errorById);
      setSuccessById(nextFeedback.successById);

      if (result.failed.length > 0 && result.updated.length > 0) {
        setError("Some category updates still need attention.");
        return;
      }

      if (result.failed.length > 0) {
        setError("No category changes were saved.");
        return;
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save these category changes");
    } finally {
      setIsSavingAll(false);
    }
  }

  function openRuleDraft(transactionId: string) {
    const transaction = transactions.find((item) => item.id === transactionId);

    if (!transaction) {
      return;
    }

    setRuleDraftById((current) => ({
      ...current,
      [transactionId]: buildInitialReviewRuleDraft(transaction, drafts),
    }));
  }

  function closeRuleDraft(transactionId: string) {
    setRuleDraftById((current) => ({ ...current, [transactionId]: undefined }));
  }

  function updateRuleDraft(
    transactionId: string,
    update: Partial<Pick<ImportReviewRuleDraft, "category_id" | "match_field" | "match_text">>,
  ) {
    setRuleDraftById((current) => {
      const existingDraft = current[transactionId];

      if (!existingDraft) {
        return current;
      }

      return {
        ...current,
        [transactionId]: {
          ...existingDraft,
          ...update,
        },
      };
    });
  }

  async function handleCreateRule(transactionId: string, applyNow: boolean) {
    const ruleDraft = ruleDraftById[transactionId];

    if (!ruleDraft) {
      return;
    }

    setRuleBusyId(transactionId);
    setError(null);

    try {
      const result = await onCreateRuleFromReview({
        ...ruleDraft,
        apply_now: applyNow,
        dirty_transaction_ids: dirtyUpdates.map((update) => update.transaction_id),
      });
      const appliedCount = result.applied_transactions.length;
      const skippedCount = result.skipped_rows.length;
      const message = applyNow
        ? appliedCount > 0
          ? `Rule saved and applied to ${appliedCount} matching row${appliedCount === 1 ? "" : "s"}.`
          : "Rule saved. No additional persisted rows needed updates."
        : `Rule saved. ${result.match_count} additional matching row${result.match_count === 1 ? "" : "s"} available for apply now.`;
      const skippedSuffix =
        skippedCount > 0
          ? ` ${skippedCount} drafted row${skippedCount === 1 ? "" : "s"} skipped to protect unsaved changes.`
          : "";

      setDrafts((current) => ({ ...current, [transactionId]: undefined }));
      closeRuleDraft(transactionId);
      setErrorById((current) => ({ ...current, [transactionId]: undefined }));
      setSuccessById((current) => ({
        ...current,
        [transactionId]: `${message}${skippedSuffix}`,
      }));
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save this rule";
      setError(message);
      setErrorById((current) => ({ ...current, [transactionId]: message }));
    } finally {
      setRuleBusyId(null);
    }
  }

  return (
    <section className="rounded-[28px] border border-white/12 bg-white/8 p-6 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-cyan-200/70 uppercase">Transaction Review</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Adjust categories without editing source values.</h2>
        </div>
        <div className="rounded-full border border-white/12 bg-slate-950/30 px-4 py-2 text-sm text-slate-200">
          {transactions.length} row{transactions.length === 1 ? "" : "s"} ready for review
        </div>
      </div>

      {dirtyCount > 0 && (
        <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-cyan-200/15 bg-slate-950/35 p-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm font-medium text-cyan-100">
            {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              className="rounded-2xl bg-white/12 text-white hover:bg-white/18"
              disabled={isSavingAll}
              onClick={() => {
                void handleSaveAllChanges();
              }}
            >
              {isSavingAll ? "Saving changes..." : "Save all changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-2xl border border-white/12 text-slate-200 hover:bg-white/8"
              disabled={isSavingAll}
              onClick={() => {
                setDrafts({});
                setError(null);
                setErrorById({});
                setSuccessById({});
              }}
            >
              Discard changes
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm text-slate-100">
          <thead className="text-xs tracking-[0.22em] text-slate-400 uppercase">
            <tr>
              <th className="px-4">Date</th>
              <th className="px-4">Title</th>
              <th className="px-4">Recipient</th>
              <th className="px-4">Amount</th>
              <th className="px-4">Category</th>
              <th className="px-4">Rule</th>
              <th className="px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => {
              const currentDraft = drafts[transaction.id];
              const isDirty =
                currentDraft !== undefined && getCategorySelectValue(transaction.category_id) !== currentDraft;
              const currentRuleDraft = ruleDraftById[transaction.id];
              const ruleDraftCategoryId =
                currentRuleDraft?.category_id ?? getDraftCategoryId(transaction, drafts, transaction.id);
              const previewRule =
                currentRuleDraft && ruleDraftCategoryId && currentRuleDraft.match_text.trim() ? currentRuleDraft : null;
              const preview = buildReviewRulePreview(transactions, transaction.id, previewRule, dirtyUpdates);
              const badgeLabel = getRuleBadgeLabel(transaction.category_rule);

              return (
                <tr key={transaction.id} className="rounded-3xl bg-slate-950/28">
                  <td className="rounded-l-3xl px-4 py-4 align-top">{transaction.transaction_date}</td>
                  <td className="px-4 py-4 align-top">{transaction.title}</td>
                  <td className="px-4 py-4 align-top">{transaction.recipient}</td>
                  <td className="px-4 py-4 align-top font-medium text-white">{formatAmount(transaction.amount)}</td>
                  <td className="px-4 py-4 align-top">
                    <select
                      value={currentDraft ?? getCategorySelectValue(transaction.category_id)}
                      onChange={(event) => {
                        const { value } = event.target;
                        const nextCategoryId = value === "" ? null : value;

                        setDrafts((current) => ({
                          ...current,
                          [transaction.id]: value,
                        }));
                        setErrorById((current) => ({ ...current, [transaction.id]: undefined }));
                        setSuccessById((current) => ({ ...current, [transaction.id]: undefined }));
                        setRuleDraftById((current) => {
                          const existingDraft = current[transaction.id];

                          if (!existingDraft) {
                            return current;
                          }

                          return {
                            ...current,
                            [transaction.id]: {
                              ...existingDraft,
                              category_id: nextCategoryId,
                            },
                          };
                        });
                      }}
                      className="w-full rounded-2xl border border-white/12 bg-slate-900/50 px-3 py-2 text-white outline-none focus:border-cyan-300/60"
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    {isDirty && <p className="mt-2 text-xs text-cyan-200">Unsaved category change.</p>}
                    {errorById[transaction.id] && (
                      <p className="mt-2 text-xs text-rose-300">{errorById[transaction.id]}</p>
                    )}
                    {successById[transaction.id] && (
                      <p className="mt-2 text-xs text-emerald-200">{successById[transaction.id]}</p>
                    )}
                    {badgeLabel && (
                      <p className="mt-2 inline-flex rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[11px] text-emerald-100">
                        {badgeLabel}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    {currentRuleDraft ? (
                      <div className="space-y-3 rounded-3xl border border-white/12 bg-slate-950/45 p-3">
                        <div className="space-y-2">
                          <label className="text-[11px] tracking-[0.18em] text-slate-400 uppercase">Match field</label>
                          <select
                            value={currentRuleDraft.match_field}
                            onChange={(event) => {
                              updateRuleDraft(transaction.id, {
                                match_field: event.target.value as RuleMatchField,
                              });
                            }}
                            className="w-full rounded-2xl border border-white/12 bg-slate-900/50 px-3 py-2 text-white outline-none focus:border-cyan-300/60"
                          >
                            <option value="recipient">Recipient</option>
                            <option value="title">Title</option>
                            <option value="both">Recipient + title</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] tracking-[0.18em] text-slate-400 uppercase">Match text</label>
                          <input
                            type="text"
                            value={currentRuleDraft.match_text}
                            onChange={(event) => {
                              updateRuleDraft(transaction.id, {
                                match_text: event.target.value,
                              });
                            }}
                            className="w-full rounded-2xl border border-white/12 bg-slate-900/50 px-3 py-2 text-white outline-none focus:border-cyan-300/60"
                          />
                        </div>
                        <p className="text-xs text-slate-300">
                          {previewRule
                            ? `${preview.matchingRowCount} additional matching row${preview.matchingRowCount === 1 ? "" : "s"} in this batch. ${preview.skippedDirtyCount} drafted row${preview.skippedDirtyCount === 1 ? "" : "s"} would be skipped if you apply now.`
                            : "Choose a category and match text before saving this rule."}
                        </p>
                        <p className="text-xs text-slate-400">
                          Rule creation stays row-level and separate from the Save all changes flow.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="rounded-2xl border border-white/12 text-slate-100 hover:bg-white/8"
                          onClick={() => {
                            openRuleDraft(transaction.id);
                          }}
                        >
                          Create rule
                        </Button>
                        <p className="text-xs text-slate-400">
                          Save this reviewed row as reusable logic without changing the bulk-save model.
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="rounded-r-3xl px-4 py-4 text-right align-top">
                    {currentRuleDraft ? (
                      <div className="flex flex-col items-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="rounded-2xl bg-white/12 text-white hover:bg-white/18"
                          disabled={
                            ruleBusyId === transaction.id || !ruleDraftCategoryId || !currentRuleDraft.match_text.trim()
                          }
                          onClick={() => {
                            void handleCreateRule(transaction.id, false);
                          }}
                        >
                          {ruleBusyId === transaction.id ? "Saving rule..." : "Save rule only"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="rounded-2xl border border-cyan-200/25 text-cyan-100 hover:bg-cyan-200/10"
                          disabled={
                            ruleBusyId === transaction.id || !ruleDraftCategoryId || !currentRuleDraft.match_text.trim()
                          }
                          onClick={() => {
                            void handleCreateRule(transaction.id, true);
                          }}
                        >
                          {ruleBusyId === transaction.id ? "Applying rule..." : "Save and apply now"}
                        </Button>
                        <button
                          type="button"
                          className="text-xs text-slate-400 underline underline-offset-4"
                          onClick={() => {
                            closeRuleDraft(transaction.id);
                          }}
                        >
                          Cancel rule draft
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Bulk save stays category-only</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
