import { startTransition, useState, type SyntheticEvent } from "react";
import type { MonthlyIncome } from "@/lib/budget/data";
import { Button } from "@/components/ui/button";

interface Props {
  initialIncome: MonthlyIncome | null;
  selectedMonth: string;
  onSaved: (income: MonthlyIncome) => void;
}

interface FieldErrors {
  amount?: string;
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  return "Could not save monthly income";
}

export function IncomeForm({ initialIncome, selectedMonth, onSaved }: Props) {
  const [amount, setAmount] = useState(initialIncome ? String(initialIncome.amount) : "");
  const [isEstimated, setIsEstimated] = useState(initialIncome?.is_estimated ?? false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate() {
    const nextErrors: FieldErrors = {};
    const parsed = Number(amount);

    if (!amount.trim()) {
      nextErrors.amount = "Income amount is required";
    } else if (!Number.isFinite(parsed)) {
      nextErrors.amount = "Enter a valid number";
    } else if (parsed < 0) {
      nextErrors.amount = "Income amount cannot be negative";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      const response = await fetch("/api/budget/income", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          month: selectedMonth,
          amount: Number(amount),
          is_estimated: isEstimated,
        }),
      });
      const payload = (await response.json()) as { error?: string; income?: MonthlyIncome };
      const income = payload.income;

      if (!response.ok || !income) {
        throw new Error(getErrorMessage(payload.error));
      }

      startTransition(() => {
        onSaved(income);
      });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Could not save monthly income");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-white/12 bg-white/8 p-6 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-cyan-200/70 uppercase">Monthly Income</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Plan this month&apos;s available cash.</h2>
        </div>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
          {selectedMonth.slice(0, 7)}
        </span>
      </div>

      <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleSubmit} noValidate>
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-100">Income amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setErrors((prev) => ({ ...prev, amount: undefined }));
            }}
            className="w-full rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-white transition outline-none focus:border-cyan-300/60"
            placeholder="5000"
          />
          {errors.amount && <p className="text-sm text-rose-300">{errors.amount}</p>}
        </label>

        <div className="flex flex-col justify-end gap-3">
          <label className="flex items-center gap-3 rounded-2xl border border-white/12 bg-slate-950/25 px-4 py-3 text-sm text-slate-100">
            <input
              type="checkbox"
              checked={isEstimated}
              onChange={(event) => {
                setIsEstimated(event.target.checked);
              }}
              className="size-4 rounded border-white/20 bg-slate-950/60"
            />
            Estimated amount
          </label>
          <Button
            type="submit"
            className="h-12 rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save income"}
          </Button>
        </div>
      </form>

      {serverError && <p className="mt-4 text-sm text-rose-300">{serverError}</p>}

      {initialIncome && !serverError && (
        <p className="mt-4 text-sm text-slate-300">
          Last saved amount: <span className="font-semibold text-white">{initialIncome.amount}</span>
        </p>
      )}
    </section>
  );
}
