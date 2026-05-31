import { startTransition, useState } from "react";
import type { BudgetCategory } from "@/lib/budget/data";
import type { RuleWithCategory } from "@/lib/rules/data";
import type { MonthlySummaryResult } from "@/lib/summary/data";
import { CategoryUsageTable } from "@/components/dashboard/CategoryUsageTable";
import { IncompleteReviewNotice } from "@/components/dashboard/IncompleteReviewNotice";
import { MonthlySummaryHeader } from "@/components/dashboard/MonthlySummaryHeader";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { RuleManager } from "@/components/rules/RuleManager";
import type { RuleDraft } from "@/components/rules/RuleForm";

interface Props {
  categories: BudgetCategory[];
  initialRules: RuleWithCategory[];
  initialSummary: MonthlySummaryResult;
}

function validateDraft(draft: RuleDraft) {
  const matchText = draft.match_text.trim();
  const targetCategoryId = draft.target_category_id.trim();

  if (!matchText) {
    throw new Error("Rule match text cannot be blank");
  }

  if (!targetCategoryId) {
    throw new Error("Choose a target category");
  }

  return {
    match_field: draft.match_field,
    match_text: matchText,
    target_category_id: targetCategoryId,
  };
}

export function SummaryWorkspace({ categories, initialRules, initialSummary }: Props) {
  const [summary, setSummary] = useState(initialSummary);
  const [rules, setRules] = useState(initialRules);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingRule, setIsSavingRule] = useState(false);

  async function refreshSummary(month: string) {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch(`/api/dashboard/summary?month=${month.slice(0, 7)}`);
      const payload = (await response.json()) as MonthlySummaryResult & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not refresh this summary");
      }

      startTransition(() => {
        setSummary(payload);
        setNotice(`Summary refreshed for ${payload.selected_month.slice(0, 7)}.`);
      });
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh this summary");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function createRule(draft: RuleDraft) {
    setIsSavingRule(true);
    setError(null);

    try {
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(validateDraft(draft)),
      });
      const payload = (await response.json()) as { error?: string; rule?: RuleWithCategory };

      if (!response.ok || !payload.rule) {
        throw new Error(payload.error ?? "Could not create this rule");
      }

      const nextRule = payload.rule;
      startTransition(() => {
        const targetCategory = categories.find((category) => category.id === nextRule.target_category_id) ?? null;
        setRules((current) => [...current, { ...nextRule, target_category: targetCategory }]);
        setNotice("Rule created.");
      });
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "Could not create this rule");
      throw ruleError;
    } finally {
      setIsSavingRule(false);
    }
  }

  async function updateRule(ruleId: string, draft: RuleDraft) {
    setIsSavingRule(true);
    setError(null);

    try {
      const response = await fetch(`/api/rules/${ruleId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(validateDraft(draft)),
      });
      const payload = (await response.json()) as { error?: string; rule?: RuleWithCategory };

      if (!response.ok || !payload.rule) {
        throw new Error(payload.error ?? "Could not update this rule");
      }

      const nextRule = payload.rule;
      const targetCategory = categories.find((category) => category.id === nextRule.target_category_id) ?? null;

      startTransition(() => {
        setRules((current) =>
          current.map((rule) => (rule.id === ruleId ? { ...nextRule, target_category: targetCategory } : rule)),
        );
        setNotice("Rule updated.");
      });
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "Could not update this rule");
      throw ruleError;
    } finally {
      setIsSavingRule(false);
    }
  }

  async function deleteRule(ruleId: string) {
    setIsSavingRule(true);
    setError(null);

    try {
      const response = await fetch(`/api/rules/${ruleId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not delete this rule");
      }

      startTransition(() => {
        setRules((current) => current.filter((rule) => rule.id !== ruleId));
        setNotice("Rule deleted.");
      });
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "Could not delete this rule");
    } finally {
      setIsSavingRule(false);
    }
  }

  return (
    <div className="space-y-6">
      <MonthlySummaryHeader
        availableMonths={summary.available_months}
        hasIncompleteReview={summary.incomplete_review_spend > 0}
        isRefreshing={isRefreshing}
        onMonthChange={(month) => {
          void refreshSummary(month);
        }}
        selectedMonth={summary.selected_month}
        updatedAt={summary.generated_at}
      />

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {notice && <p className="text-sm text-emerald-200">{notice}</p>}

      <SummaryCards
        incompleteReviewSpend={summary.incomplete_review_spend}
        reviewedCategorizedSpend={summary.reviewed_categorized_spend}
        totalImportedSpend={summary.total_imported_spend}
        totalIncome={summary.total_income}
      />

      <IncompleteReviewNotice
        incompleteReviewSpend={summary.incomplete_review_spend}
        warningBatches={summary.warning_batches}
      />

      <CategoryUsageTable
        categoryRows={summary.category_rows}
        reviewedUncategorizedSpend={summary.reviewed_uncategorized_spend}
      />

      <RuleManager
        categories={categories}
        isBusy={isSavingRule}
        onCreateRule={createRule}
        onDeleteRule={deleteRule}
        onUpdateRule={updateRule}
        rules={rules}
      />
    </div>
  );
}
