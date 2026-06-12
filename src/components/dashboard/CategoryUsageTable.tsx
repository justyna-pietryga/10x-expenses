import type { CategorySummaryRow } from "@/lib/summary/data";

interface Props {
  categoryRows: CategorySummaryRow[];
  reviewedUncategorizedSpend: number;
}

function formatAmount(amount: number) {
  return `${amount.toFixed(2)} PLN`;
}

export function CategoryUsageTable({ categoryRows, reviewedUncategorizedSpend }: Props) {
  return (
    <section className="rounded-[28px] border border-white/12 bg-white/8 p-6 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-cyan-200/70 uppercase">Category Usage</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Trusted reviewed category totals for included transactions.
          </h2>
        </div>
        <div className="rounded-full border border-white/12 bg-slate-950/30 px-4 py-2 text-sm text-slate-200">
          Reviewed uncategorized: {formatAmount(reviewedUncategorizedSpend)}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm text-slate-100">
          <thead className="text-xs tracking-[0.22em] text-slate-400 uppercase">
            <tr>
              <th className="px-4">Category</th>
              <th className="px-4">Spend</th>
              <th className="px-4">% income</th>
              <th className="px-4">Limit</th>
              <th className="px-4">Limit usage</th>
              <th className="px-4">Carry-over</th>
            </tr>
          </thead>
          <tbody>
            {categoryRows.map((row) => (
              <tr key={row.category_id} className="rounded-3xl bg-slate-950/28">
                <td className="rounded-l-3xl px-4 py-4 align-top">
                  <div className="font-medium text-white">{row.category_name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {row.carryover_enabled ? "Savings carry-over enabled" : "Month-only category"}
                  </div>
                </td>
                <td className="px-4 py-4 align-top">{formatAmount(row.reviewed_spend)}</td>
                <td className="px-4 py-4 align-top">{row.percent_of_income.toFixed(2)}%</td>
                <td className="px-4 py-4 align-top">
                  {row.percentage_limit.toFixed(2)}% ({formatAmount(row.limit_amount)})
                </td>
                <td className="px-4 py-4 align-top">{row.limit_usage_percentage.toFixed(2)}%</td>
                <td className="rounded-r-3xl px-4 py-4 align-top">
                  {row.carryover_enabled ? (
                    <div className="space-y-1">
                      <div>Open: {formatAmount(row.carryover_opening)}</div>
                      <div>Close: {formatAmount(row.carryover_closing)}</div>
                    </div>
                  ) : (
                    <span className="text-slate-400">Not applicable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
