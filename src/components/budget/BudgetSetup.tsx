import { useState } from "react";
import type { BudgetCategory, MonthlyIncome } from "@/lib/budget/data";
import { calculateActiveTotalPercentage } from "@/lib/budget/validation";
import { CategoryManager } from "@/components/budget/CategoryManager";
import { IncomeForm } from "@/components/budget/IncomeForm";

interface Props {
  initialCategories: BudgetCategory[];
  initialIncome: MonthlyIncome | null;
  selectedMonth: string;
}

export function BudgetSetup({ initialCategories, initialIncome, selectedMonth }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [income, setIncome] = useState(initialIncome);
  const totalPercentage = calculateActiveTotalPercentage(categories);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)] xl:items-start">
      <div className="xl:sticky xl:top-6">
        <IncomeForm initialIncome={income} selectedMonth={selectedMonth} onSaved={setIncome} />
      </div>
      <CategoryManager categories={categories} totalPercentage={totalPercentage} onChange={setCategories} />
    </div>
  );
}
