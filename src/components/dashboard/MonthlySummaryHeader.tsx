import type { SummaryMonthOption } from "@/lib/summary/data";

interface Props {
  availableMonths: SummaryMonthOption[];
  hasIncompleteReview: boolean;
  isRefreshing: boolean;
  onMonthChange: (month: string) => void;
  selectedMonth: string;
  updatedAt: string;
}

function formatMonthLabel(month: string) {
  return month.slice(0, 7);
}

export function MonthlySummaryHeader({
  availableMonths,
  hasIncompleteReview,
  isRefreshing,
  onMonthChange,
  selectedMonth,
  updatedAt,
}: Props) {
  return (
    <section className="rounded-[28px] border border-white/12 bg-slate-950/40 p-6 shadow-[0_22px_75px_rgba(2,6,23,0.38)] backdrop-blur-xl">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.3em] text-cyan-200/70 uppercase">Monthly Summary</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Dashboard for <span className="text-cyan-200">{formatMonthLabel(selectedMonth)}</span>
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-200/75">
            Track trusted category usage, spot incomplete import review, and shape reusable categorization rules in one
            place.
          </p>
          <p className="mt-3 text-xs tracking-[0.2em] text-slate-400 uppercase">
            Refreshed {new Date(updatedAt).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-[26px] border border-white/10 bg-white/7 p-4 sm:flex-row sm:items-end">
          <label className="space-y-2">
            <span className="text-xs font-medium tracking-[0.22em] text-slate-300 uppercase">Selected month</span>
            <input
              type="month"
              value={selectedMonth.slice(0, 7)}
              onChange={(event) => {
                onMonthChange(`${event.target.value}-01`);
              }}
              className="rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-white transition outline-none focus:border-cyan-300/60"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {availableMonths.slice(0, 4).map((month) => (
              <button
                key={month.month}
                type="button"
                onClick={() => {
                  onMonthChange(month.month);
                }}
                className={`rounded-2xl border px-4 py-3 text-sm transition ${
                  month.month === selectedMonth
                    ? "border-cyan-300/60 bg-cyan-300/18 text-cyan-50"
                    : "border-white/12 bg-slate-950/30 text-slate-200 hover:border-white/20 hover:bg-white/10"
                }`}
                disabled={isRefreshing}
              >
                {formatMonthLabel(month.month)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hasIncompleteReview && (
        <div className="mt-5 rounded-3xl border border-amber-300/25 bg-amber-300/10 px-5 py-4 text-sm text-amber-50">
          Some imported spend is still pending review. Category totals below show trusted reviewed data only.
        </div>
      )}
    </section>
  );
}
