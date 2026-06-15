import type { MonthlySummaryResult } from "@/lib/summary/data";

interface Props {
  incompleteReviewSpend: MonthlySummaryResult["incomplete_review_spend"];
  warningBatches: MonthlySummaryResult["warning_batches"];
}

function formatAmount(amount: number) {
  return `${amount.toFixed(2)} PLN`;
}

export function IncompleteReviewNotice({ incompleteReviewSpend, warningBatches }: Props) {
  if (incompleteReviewSpend <= 0) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-amber-300/25 bg-amber-300/10 p-6 text-amber-50 shadow-[0_18px_60px_rgba(120,53,15,0.18)]">
      <p className="text-xs font-semibold tracking-[0.28em] text-amber-100/80 uppercase">Review Pending</p>
      <h2 className="mt-2 text-2xl font-semibold">Incomplete imported spend stays separate.</h2>
      <p className="mt-3 text-sm leading-6 text-amber-50/85">
        {formatAmount(incompleteReviewSpend)} is still waiting for import review, so it is excluded from trusted
        category totals. Rows you already excluded stay out of this warning and appear in the excluded transactions
        panel instead. Return to{" "}
        <a href="/imports" className="underline underline-offset-4">
          /imports
        </a>{" "}
        to finish review.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-amber-50/90">
        {warningBatches.map((batch) => (
          <li key={batch.id} className="rounded-2xl border border-amber-200/20 bg-black/10 px-4 py-3">
            {batch.bank} · {batch.source_filename ?? "Unnamed statement"} · imported{" "}
            {new Date(batch.imported_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
}
