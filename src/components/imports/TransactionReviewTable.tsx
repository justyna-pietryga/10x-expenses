import { useState } from "react";
import type { BudgetCategory } from "@/lib/budget/data";
import type { ImportedTransaction } from "@/lib/imports/data";
import { Button } from "@/components/ui/button";

interface Props {
  categories: BudgetCategory[];
  onSaveCategory: (transactionId: string, categoryId: string | null, saveRule: boolean) => Promise<void>;
  transactions: ImportedTransaction[];
}

function formatAmount(amount: number) {
  return `${amount.toFixed(2)} PLN`;
}

export function TransactionReviewTable({ categories, onSaveCategory, transactions }: Props) {
  const [drafts, setDrafts] = useState<Partial<Record<string, string>>>({});
  const [saveRuleById, setSaveRuleById] = useState<Partial<Record<string, boolean>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successById, setSuccessById] = useState<Partial<Record<string, string>>>({});

  async function handleSave(transactionId: string) {
    setBusyId(transactionId);
    setError(null);

    try {
      const savedRule = saveRuleById[transactionId] ?? false;

      await onSaveCategory(transactionId, drafts[transactionId] ?? null, savedRule);
      setSaveRuleById((current) => ({ ...current, [transactionId]: false }));
      setSuccessById((current) => ({
        ...current,
        [transactionId]: savedRule ? "Category saved and rule created." : "Category saved.",
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update this category");
    } finally {
      setBusyId(null);
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
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="rounded-3xl bg-slate-950/28">
                <td className="rounded-l-3xl px-4 py-4 align-top">{transaction.transaction_date}</td>
                <td className="px-4 py-4 align-top">{transaction.title}</td>
                <td className="px-4 py-4 align-top">{transaction.recipient}</td>
                <td className="px-4 py-4 align-top font-medium text-white">{formatAmount(transaction.amount)}</td>
                <td className="px-4 py-4 align-top">
                  <select
                    value={drafts[transaction.id] ?? transaction.category_id ?? ""}
                    onChange={(event) => {
                      const { value } = event.target;
                      setDrafts((current) => ({ ...current, [transaction.id]: value }));
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
                  {successById[transaction.id] && (
                    <p className="mt-2 text-xs text-emerald-200">{successById[transaction.id]}</p>
                  )}
                </td>
                <td className="rounded-r-3xl px-4 py-4 text-right align-top">
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-2xl bg-white/12 text-white hover:bg-white/18"
                    disabled={busyId === transaction.id}
                    onClick={() => {
                      void handleSave(transaction.id);
                    }}
                  >
                    {busyId === transaction.id ? "Saving..." : "Save category"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
