import { useId } from "react";
import type { BudgetCategory } from "@/lib/budget/data";
import type { RuleMatchField } from "@/lib/rules/validation";
import { Button } from "@/components/ui/button";

export interface RuleDraft {
  match_field: RuleMatchField;
  match_text: string;
  target_category_id: string;
}

interface Props {
  categories: BudgetCategory[];
  isBusy: boolean;
  onCancel?: () => void;
  onChange: (draft: RuleDraft) => void;
  onSubmit: () => void;
  submitLabel: string;
  value: RuleDraft;
}

export function RuleForm({ categories, isBusy, onCancel, onChange, onSubmit, submitLabel, value }: Props) {
  const baseId = useId();

  return (
    <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 md:grid-cols-[.85fr_1.3fr_1fr_auto]">
      <label className="space-y-2">
        <span className="text-xs font-medium tracking-[0.2em] text-slate-400 uppercase">Field</span>
        <select
          id={`${baseId}-field`}
          value={value.match_field}
          onChange={(event) => {
            onChange({ ...value, match_field: event.target.value as RuleMatchField });
          }}
          className="w-full rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
        >
          <option value="recipient">Recipient</option>
          <option value="title">Title</option>
          <option value="both">Recipient + title</option>
        </select>
      </label>
      <label className="space-y-2">
        <span className="text-xs font-medium tracking-[0.2em] text-slate-400 uppercase">Contains text</span>
        <input
          id={`${baseId}-text`}
          type="text"
          value={value.match_text}
          onChange={(event) => {
            onChange({ ...value, match_text: event.target.value });
          }}
          className="w-full rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
          placeholder="Lidl"
        />
      </label>
      <label className="space-y-2">
        <span className="text-xs font-medium tracking-[0.2em] text-slate-400 uppercase">Target category</span>
        <select
          id={`${baseId}-category`}
          value={value.target_category_id}
          onChange={(event) => {
            onChange({ ...value, target_category_id: event.target.value });
          }}
          className="w-full rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
        >
          <option value="">Choose category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-end justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            className="rounded-2xl bg-white/14 text-white hover:bg-white/20"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200"
          disabled={isBusy}
          onClick={onSubmit}
        >
          {isBusy ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
