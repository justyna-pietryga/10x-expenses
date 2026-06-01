# Frame Brief: Import Review Workflow Enhancements

> Framing step before /10x-plan. This document captures what is actually at issue, separated from what was initially assumed.

## Reported Observation

After completing the first roadmap, the import-review and rule-management experience still feels inefficient and unclear in everyday use. The user reported five concrete symptoms:

- Import review requires clicking `Save category` on every edited transaction row.
- `Save as rule` resets after saving, so the user cannot tell later whether a rule was already saved for that row.
- Category and rule management surfaces feel too large and scroll-heavy.
- Creating a rule from import review does not let the user choose whether it matches title, recipient, or both.
- Saving a rule from one import row does not automatically apply it to other matching rows in the current batch.

## Initial Framing Preserved

- **User's stated cause or approach**: These issues should be added to the roadmap and shaped into fixes or reimplementation work.
- **User's proposed direction**: Consider bulk saving, clearer rule-saved state, denser UI, field-aware rule creation from import review, and automatic application of new rules to matching rows.
- **Pre-dispatch narrowing**: Treated as several observations within one broader class of symptoms: import review is still row-local, opaque about rules, and visually too spacious for repeated monthly work.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Review interaction model** - the UI stores per-row drafts and requires a per-row save, so the workflow optimizes for isolated corrections instead of batch review.
2. **Rule authoring model inside imports** - import review can only opt into a hard-coded recipient rule, while dashboard rules support title, recipient, or both.
3. **Rule feedback and provenance** - the UI does not show whether a transaction already has a matching saved rule, or what rule would be created.
4. **Rule application lifecycle** - newly created rules are persisted, but they are not reapplied to the current batch after creation.
5. **Information density and layout system** - category and rule surfaces use large cards, large radius, and generous vertical spacing, which makes operational screens feel scroll-heavy.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Review interaction model is row-local | `src/components/imports/TransactionReviewTable.tsx` keeps `drafts`, `saveRuleById`, `busyId`, and `successById` by transaction id. Each row has its own `Save category` button that calls `handleSave(transaction.id)`. | STRONG |
| Import rule authoring is less capable than dashboard rule authoring | `src/lib/imports/data.ts` saves import-created rules with `match_field: "recipient"` and `match_text: transaction.recipient`. `src/components/rules/RuleForm.tsx` supports `recipient`, `title`, and `both`. | STRONG |
| Rule feedback is incomplete | `TransactionReviewTable.tsx` resets `saveRuleById[transactionId]` to false after save and only stores transient row success text. There is no loaded rule-match/provenance state per transaction. | STRONG |
| New rules are not reapplied to current batch | `ImportWorkspace.tsx` updates only the saved transaction returned by `/api/imports/transactions/[id]`. `src/lib/imports/data.ts` creates the rule but does not update other transactions that match it. | STRONG |
| UI density is the root problem | `CategoryManager.tsx` and `RuleManager.tsx` use card-per-item layouts with large padding and rounded surfaces. This explains scrolling, but not the save/rule trust problems. | WEAK |

## Narrowing Signals

- The most painful reports are about repeated action cost and uncertainty: forgetting to save rows, not knowing whether a rule exists, and needing to repeat category work after creating a rule.
- The visual density complaint is real, but it appears secondary. Compacting cards alone would not fix the row-by-row workflow or rule semantics.
- The import review experience and dashboard rule manager have drifted apart: dashboard rules are field-aware, while import-created rules remain recipient-only.

## Cross-System Convention

Review workflows that process many similar records usually separate editing from committing, show dirty/changed state, and support bulk save or auto-save with clear status. Rule-assisted categorization workflows usually preview what a rule matches, show whether a row is already covered by a rule, and let a newly created rule update other matching unresolved rows. The current implementation has the underlying rule engine, but the import review surface does not expose enough of that model.

## Reframed Problem Statement

> **The actual problem to plan around is**: Import review needs to become a batch-oriented categorization workflow with visible rule semantics, not a table of isolated row updates.

The user's suggested fixes mostly point at the same root: review work should be efficient across many rows and trustworthy about what rules exist or will be created. Planning should focus first on bulk review and field-aware rule creation/application inside imports. A separate visual-density pass can follow once the workflow shape is right.

## Confidence

- **HIGH** - the symptoms map directly to current component and helper behavior, and the stronger hypothesis explains four of the five reported issues.

## What Changes for /10x-plan

The next plan should probably create roadmap follow-up slices around import review efficiency and rule trust. The first slice should address batch save, dirty state, field-aware rule creation from import review, and applying newly saved rules to other matching rows. A second, smaller UI-density slice can compact category and rule management surfaces after the workflow behavior is settled.

## Suggested Roadmap Additions

These are not implementation plans yet; they are framed roadmap candidates.

| Candidate ID | Change ID | Outcome | Why this belongs together |
| --- | --- | --- | --- |
| UX-01 | import-review-bulk-categorization | User can review many imported transactions efficiently, save category changes in bulk, and clearly see unsaved state. | Addresses the high-friction row-by-row save workflow. |
| UX-02 | import-review-rule-application | User can create field-aware rules from import review, see whether a row is already rule-backed, and apply a new rule to matching rows in the current batch. | Addresses rule opacity, recipient-only import rules, and repeated manual category work. |
| UX-03 | management-surface-density | User can scan and manage categories and rules in denser operational layouts without excessive scrolling. | Addresses visual density separately so layout polish does not obscure workflow correctness. |

## References

- User notes: `context/foundation/resources/enhancements-notes-after-first-roadmap.md`
- Import review table: `src/components/imports/TransactionReviewTable.tsx`
- Import workspace state: `src/components/imports/ImportWorkspace.tsx`
- Import rule persistence: `src/lib/imports/data.ts`
- Import transaction route: `src/pages/api/imports/transactions/[id].ts`
- Dashboard rule form: `src/components/rules/RuleForm.tsx`
- Dashboard rule manager: `src/components/rules/RuleManager.tsx`
- Category manager density example: `src/components/budget/CategoryManager.tsx`
- Current roadmap: `context/foundation/roadmap.md`
