interface Props {
  excludedInflow: number;
  excludedOutflow: number;
}

function formatAmount(amount: number) {
  return `${amount.toFixed(2)} PLN`;
}

export function ExcludedTransactionsPanel({ excludedInflow, excludedOutflow }: Props) {
  if (excludedInflow <= 0 && excludedOutflow <= 0) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-sky-300/20 bg-sky-300/10 p-6 shadow-[0_18px_60px_rgba(8,47,73,0.22)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.28em] text-sky-100/80 uppercase">Excluded transactions</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Imported history kept, budget math removed.</h2>
          <p className="mt-3 text-sm leading-6 text-sky-50/85">
            These rows still belong to the imported statement history, but they do not affect trusted category totals,
            reviewed uncategorized spend, or incomplete-review spend.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/12 bg-slate-950/30 px-5 py-4">
            <p className="text-xs font-semibold tracking-[0.22em] text-sky-100/70 uppercase">Excluded outflow</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatAmount(excludedOutflow)}</p>
          </div>
          <div className="rounded-3xl border border-white/12 bg-slate-950/30 px-5 py-4">
            <p className="text-xs font-semibold tracking-[0.22em] text-sky-100/70 uppercase">Excluded inflow</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatAmount(excludedInflow)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
