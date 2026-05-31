import { startTransition, useState } from "react";
import type { BudgetCategory } from "@/lib/budget/data";
import type { ImportBatch, ImportedTransaction } from "@/lib/imports/data";
import { ImportUploadForm, type ImportPreviewPayload } from "@/components/imports/ImportUploadForm";
import { ReviewCompletionBar } from "@/components/imports/ReviewCompletionBar";
import { TransactionReviewTable } from "@/components/imports/TransactionReviewTable";

interface Props {
  categories: BudgetCategory[];
  initialBatch: ImportBatch | null;
  initialTransactions: ImportedTransaction[];
}

interface CommitPayload {
  batch: ImportBatch;
  replaced: boolean;
  transactions: ImportedTransaction[];
}

export function ImportWorkspace({ categories, initialBatch, initialTransactions }: Props) {
  const [preview, setPreview] = useState<ImportPreviewPayload | null>(null);
  const [batch, setBatch] = useState(initialBatch);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [error, setError] = useState<string | null>(null);
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

      const nextBatch = payload.batch;
      const nextTransactions = payload.transactions;

      startTransition(() => {
        setBatch(nextBatch);
        setTransactions(nextTransactions);
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

  async function handleSaveCategory(transactionId: string, categoryId: string | null, saveRule: boolean) {
    const response = await fetch(`/api/imports/transactions/${transactionId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        category_id: categoryId,
        save_rule: saveRule,
      }),
    });
    const payload = (await response.json()) as { error?: string; transaction?: ImportedTransaction };

    if (!response.ok || !payload.transaction) {
      throw new Error(payload.error ?? "Could not update this category");
    }

    const nextTransaction = payload.transaction;

    startTransition(() => {
      setTransactions((current) =>
        current.map((transaction) => (transaction.id === nextTransaction.id ? nextTransaction : transaction)),
      );
      setNotice(saveRule ? "Category updated and rule saved." : "Category updated.");
    });
  }

  async function handleCompleteReview() {
    if (!batch) {
      return;
    }

    const response = await fetch(`/api/imports/batches/${batch.id}/complete`, {
      method: "POST",
    });
    const payload = (await response.json()) as { batch?: ImportBatch; error?: string };

    if (!response.ok || !payload.batch) {
      throw new Error(payload.error ?? "Could not mark this review complete");
    }

    const nextBatch = payload.batch;

    startTransition(() => {
      setBatch(nextBatch);
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
          <ReviewCompletionBar batch={batch} transactionCount={transactions.length} onComplete={handleCompleteReview} />
          <TransactionReviewTable
            categories={categories}
            transactions={transactions}
            onSaveCategory={handleSaveCategory}
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
