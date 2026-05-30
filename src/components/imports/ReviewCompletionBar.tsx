import { useState } from "react";
import type { ImportBatch } from "@/lib/imports/data";
import { Button } from "@/components/ui/button";

interface Props {
  batch: ImportBatch;
  onComplete: () => Promise<void>;
  transactionCount: number;
}

export function ReviewCompletionBar({ batch, onComplete, transactionCount }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const isComplete = Boolean(batch.review_completed_at);

  async function handleComplete() {
    setIsCompleting(true);
    setError(null);

    try {
      await onComplete();
    } catch (completionError) {
      setError(completionError instanceof Error ? completionError.message : "Could not mark this review complete");
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-white/12 bg-slate-950/35 p-5 shadow-[0_20px_70px_rgba(2,6,23,0.3)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-cyan-200/70 uppercase">Review Status</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {isComplete
              ? "This batch is ready for downstream summaries."
              : "This batch still needs review confirmation."}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-200/75">
            {transactionCount} imported transaction{transactionCount === 1 ? "" : "s"} in {batch.statement_month}
          </p>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        </div>

        <div
          className={`rounded-full border px-4 py-2 text-sm ${
            isComplete
              ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
              : "border-amber-300/30 bg-amber-300/12 text-amber-100"
          }`}
        >
          {isComplete ? "Review complete" : "Pending review"}
        </div>
      </div>

      {!isComplete && (
        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            disabled={isCompleting}
            onClick={() => {
              void handleComplete();
            }}
          >
            {isCompleting ? "Completing..." : "Mark review complete"}
          </Button>
        </div>
      )}
    </section>
  );
}
