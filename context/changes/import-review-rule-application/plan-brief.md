# Import Review Rule Application — Plan Brief

> Full plan: `context/changes/import-review-rule-application/plan.md`

## What & Why

Implement `UX-02` so import review can turn one reviewed transaction into an explicit field-aware rule, show whether that rule can help with the current batch, and explain which rows are rule-backed. The goal is to finish the review-side rule workflow that `UX-01` intentionally deferred, without breaking batch category saves or overwriting unsaved manual review work.

## Starting Point

The app already has two halves of this capability, but they are disconnected. Import review supports bulk category saving and dirty-state protection, while the dashboard/rules domain already supports explicit `recipient` / `title` / `both` rules. The missing piece is the review workflow that connects them safely inside the current batch.

## Desired End State

A user can create a rule directly from a review row, with `recipient` preselected by default, and save that row plus the rule in one action. The UI can then show how many current-batch rows match and let the user explicitly choose whether to apply the rule now. Matching persisted rows update in place, dirty drafted rows are skipped, and rule-backed rows show visible provenance in the review table.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Anchor action | Save current row and create the rule in one action | Keeps the reviewed row as the example transaction the rule is built from. | Plan |
| Default match field | `recipient` | Preserves continuity with the current import-review shortcut and typical merchant stability. | Plan |
| Current-batch timing | Explicit apply-now choice after rule creation | Avoids silent financial mutations while still delivering immediate batch value. | Plan |
| Preview detail | Count only | Gives impact visibility without adding a denser row-list preview surface in this slice. | Plan |
| Rule-backed visibility | Compact provenance badge in the review table | Directly answers why a row is categorized where the user is making review decisions. | Roadmap / Plan |
| Draft conflicts | Skip dirty rows, report them | Protects unsaved manual review decisions and preserves `UX-01` trust boundaries. | Plan |
| Testing depth | Extend existing integration/static UI suites | Matches current repository patterns and protects the risky contracts without forcing E2E up front. | Plan |

## Scope

**In scope:** review-side rule creation, explicit field selection, count-only current-batch preview, optional apply-now behavior, skipped-draft protection, rule-backed row provenance, focused route/helper/UI test coverage.

**Out of scope:** dashboard rule redesign, row-list previews, silent auto-apply, overwriting unsaved drafts, density/layout work for `UX-03`, and mandatory E2E coverage.

## Architecture / Approach

Add one review-specific rule endpoint on top of the existing import-review and shared rules domain. The backend saves the anchor row, creates or upserts the explicit rule, counts current-batch matches, and optionally applies it to eligible persisted rows. The frontend replaces the temporary checkbox shortcut with a clearer row-level rule flow and merges any applied-row updates back into workspace state while surfacing visible provenance badges.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Rule Application Contract | Backend helper/route for review-side rule creation, preview counts, and optional apply-now | Wrong mutation boundaries could overwrite rows outside the intended batch or conflict with dirty drafts |
| 2. Review Workflow UI | Explicit rule action flow with field defaults, count preview, and apply-now choice | Confusing copy or too much coupling with bulk save would erode trust |
| 3. Provenance and Workspace State | Applied-row merge behavior and visible rule-backed badges in review | Provenance may be hard to persist truthfully if the current model lacks enough signal |
| 4. Regression and Handoff | Focused regression coverage and scope alignment | The slice could accidentally absorb broader rule-management or density work |

**Prerequisites:** `UX-01` bulk category review and `S-03` field-aware rules are already implemented.
**Estimated effort:** ~3-4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Persisted rule-backed provenance can be derived truthfully without needing a new schema field.
- Count-only preview is sufficient for trust in the MVP review workflow.
- Existing import-review test suites are enough to cover the highest-risk behavior without adding browser automation immediately.

## Success Criteria (Summary)

- A user can create a field-aware rule directly from import review and save the anchor row at the same time.
- The user can explicitly choose whether to apply the new rule to matching rows in the current batch, with dirty drafted rows skipped rather than overwritten.
- Rule-backed rows are visibly marked in the review table so users can understand why categories were assigned.
