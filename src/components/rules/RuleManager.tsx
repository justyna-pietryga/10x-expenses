import { useState } from "react";
import type { BudgetCategory } from "@/lib/budget/data";
import type { RuleWithCategory } from "@/lib/rules/data";
import { RuleForm, type RuleDraft } from "@/components/rules/RuleForm";
import { Button } from "@/components/ui/button";

interface Props {
  categories: BudgetCategory[];
  isBusy: boolean;
  onCreateRule: (draft: RuleDraft) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
  onUpdateRule: (ruleId: string, draft: RuleDraft) => Promise<void>;
  rules: RuleWithCategory[];
}

function createEmptyDraft(): RuleDraft {
  return {
    match_field: "recipient",
    match_text: "",
    target_category_id: "",
  };
}

function describeField(matchField: RuleDraft["match_field"]) {
  if (matchField === "title") {
    return "title";
  }

  if (matchField === "both") {
    return "recipient + title";
  }

  return "recipient";
}

export function RuleManager({ categories, isBusy, onCreateRule, onDeleteRule, onUpdateRule, rules }: Props) {
  const [draft, setDraft] = useState<RuleDraft>(createEmptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<RuleDraft>(createEmptyDraft());

  return (
    <section className="rounded-[28px] border border-white/12 bg-white/8 p-6 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-cyan-200/70 uppercase">Reusable Rules</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Make future imports easier to categorize.</h2>
        </div>
        <div className="rounded-full border border-white/12 bg-slate-950/30 px-4 py-2 text-sm text-slate-200">
          {rules.length} rule{rules.length === 1 ? "" : "s"} saved
        </div>
      </div>

      <div className="mt-6">
        <RuleForm
          categories={categories}
          isBusy={isBusy}
          onChange={setDraft}
          onSubmit={() => {
            void onCreateRule(draft).then(() => {
              setDraft(createEmptyDraft());
            });
          }}
          submitLabel="Add rule"
          value={draft}
        />
      </div>

      <div className="mt-6 space-y-3">
        {rules.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 bg-white/4 px-5 py-8 text-center text-sm text-slate-300">
            No reusable rules yet. Create the first one above.
          </div>
        ) : (
          rules.map((rule) => {
            const isEditing = editingId === rule.id;

            return (
              <article key={rule.id} className="rounded-3xl border border-white/10 bg-slate-950/26 p-4">
                {isEditing ? (
                  <RuleForm
                    categories={categories}
                    isBusy={isBusy}
                    onCancel={() => {
                      setEditingId(null);
                      setEditingDraft(createEmptyDraft());
                    }}
                    onChange={setEditingDraft}
                    onSubmit={() => {
                      void onUpdateRule(rule.id, editingDraft).then(() => {
                        setEditingId(null);
                        setEditingDraft(createEmptyDraft());
                      });
                    }}
                    submitLabel="Save rule"
                    value={editingDraft}
                  />
                ) : (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <p className="text-sm text-slate-200">
                        Match{" "}
                        <span className="font-semibold text-white">
                          {describeField(rule.match_field as RuleDraft["match_field"])}
                        </span>{" "}
                        contains <span className="font-semibold text-cyan-200">{rule.match_text}</span> →{" "}
                        <span className="font-semibold text-white">
                          {rule.target_category?.name ?? "Unknown category"}
                        </span>
                      </p>
                      <p className="text-xs tracking-[0.2em] text-slate-400 uppercase">
                        Created {new Date(rule.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="rounded-2xl bg-white/14 text-white hover:bg-white/20"
                        onClick={() => {
                          setEditingId(rule.id);
                          setEditingDraft({
                            match_field: rule.match_field as RuleDraft["match_field"],
                            match_text: rule.match_text,
                            target_category_id: rule.target_category_id,
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="rounded-2xl"
                        disabled={isBusy}
                        onClick={() => {
                          void onDeleteRule(rule.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
