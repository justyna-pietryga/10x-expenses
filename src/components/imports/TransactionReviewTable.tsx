import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BudgetCategory } from "@/lib/budget/data";
import type { ImportCategoryUpdateFailure, ImportedTransaction } from "@/lib/imports/data";

export interface ImportCategoryDraftUpdate {
  category_id: string | null;
  transaction_id: string;
}

export interface ImportCategorySaveResult {
  failed: ImportCategoryUpdateFailure[];
  updated: { category_id: string | null; id: string }[];
}

interface Props {
  categories: BudgetCategory[];
  onSaveCategoryChanges: (updates: ImportCategoryDraftUpdate[]) => Promise<ImportCategorySaveResult>;
  onSaveRuleShortcut: (transactionId: string, categoryId: string | null) => Promise<void>;
  transactions: ImportedTransaction[];
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

export function buildDirtyCategoryUpdates(
  transactions: ImportedTransaction[],
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
  onSaveCategoryChanges,
  onSaveRuleShortcut,
  transactions,
}: Props) {
  const [drafts, setDrafts] = useState<Partial<Record<string, string>>>(initialDrafts ?? {});
  const [saveRuleById, setSaveRuleById] = useState<Partial<Record<string, boolean>>>({});
  const [ruleBusyId, setRuleBusyId] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Partial<Record<string, string>>>(initialRowErrors ?? {});
  const [successById, setSuccessById] = useState<Partial<Record<string, string>>>(initialSuccessById ?? {});
  const dirtyUpdates = buildDirtyCategoryUpdates(transactions, drafts);
  const dirtyCount = dirtyUpdates.length;

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

  async function handleSaveRuleShortcut(transactionId: string) {
    setRuleBusyId(transactionId);
    setError(null);

    try {
      const draftValue = drafts[transactionId];
      const categoryId = draftValue === undefined ? null : draftValue === "" ? null : draftValue;

      await onSaveRuleShortcut(transactionId, categoryId);
      setSaveRuleById((current) => ({ ...current, [transactionId]: false }));
      setErrorById((current) => ({ ...current, [transactionId]: undefined }));
      setSuccessById((current) => ({
        ...current,
        [transactionId]: "Category saved and rule created.",
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this rule");
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

                        setDrafts((current) => ({
                          ...current,
                          [transaction.id]: value,
                        }));
                        setErrorById((current) => ({ ...current, [transaction.id]: undefined }));
                        setSuccessById((current) => ({ ...current, [transaction.id]: undefined }));
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
                  </td>
                  <td className="px-4 py-4 align-top">
                    <label className="flex items-center gap-2 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={saveRuleById[transaction.id] ?? false}
                        onChange={(event) => {
                          setSaveRuleById((current) => ({ ...current, [transaction.id]: event.target.checked }));
                        }}
                        className="size-4 rounded border-white/20 bg-slate-950/60"
                      />
                      Save as rule
                    </label>
                    <p className="mt-2 text-xs text-slate-400">
                      Rule saving stays row-by-row and is separate from bulk save.
                    </p>
                  </td>
                  <td className="rounded-r-3xl px-4 py-4 text-right align-top">
                    {saveRuleById[transaction.id] ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="rounded-2xl bg-white/12 text-white hover:bg-white/18"
                        disabled={ruleBusyId === transaction.id}
                        onClick={() => {
                          void handleSaveRuleShortcut(transaction.id);
                        }}
                      >
                        {ruleBusyId === transaction.id ? "Saving rule..." : "Save rule for row"}
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-500">Use bulk save above</span>
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
