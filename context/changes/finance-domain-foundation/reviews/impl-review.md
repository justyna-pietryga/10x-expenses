<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finance Domain Foundation

- **Plan**: context/changes/finance-domain-foundation/plan.md
- **Scope**: Phases 1-3 of 3
- **Date**: 2026-05-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 - Category delete may fail for categorized transactions

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260526103000_finance_domain_foundation.sql:61
- **Detail**: `transactions_category_fk` references `(category_id, user_id)` with `on delete set null`, but `transactions.user_id` is `not null`. Deleting a category may attempt to null both FK columns and fail, instead of preserving the transaction as uncategorized.
- **Fix**: Use PostgreSQL column-specific `on delete set null (category_id)`.
  - Strength: Preserves transaction ownership while allowing category deletion.
  - Tradeoff: Requires confirming the local/Supabase Postgres version supports column-specific SET NULL in FK actions.
  - Confidence: MED - this is supported by modern PostgreSQL, but should be verified with `npx supabase db reset`.
  - Blind spot: No downstream delete-category UI exists yet, so behavior was not exercised through application code.
- **Decision**: FIXED - Applied column-specific `on delete set null (category_id)` and verified with `npx supabase db reset`.

### F2 - RLS verification notes document handoff steps more than executed evidence

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/changes/finance-domain-foundation/rls-verification.md:138
- **Detail**: The plan says RLS verification should record how isolation was verified, including user A, user B, mismatched inserts, and unauthenticated denial. The file provides repeatable SQL, but the local summary only confirms schema checks and frames cross-user isolation as future handoff validation.
- **Fix**: Update the verification note with the exact RLS scenarios executed and their outcomes, or mark those scenarios as not yet executed.
  - Strength: Aligns the handoff document with the plan's "tested, not just declared" intent.
  - Tradeoff: If the scenarios were not actually run, this requires running the SQL or explicitly downgrading the claim.
  - Confidence: HIGH - the current text clearly separates schema checks from future repeatable isolation checks.
  - Blind spot: I did not inspect external terminal history, only committed docs.
- **Decision**: FIXED - Ran local RLS isolation checks and updated `rls-verification.md` with executed outcomes.

### F3 - Repeatable RLS snippets use SET LOCAL without transaction wrappers

- **Severity**: OBSERVATION
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/finance-domain-foundation/rls-verification.md:78
- **Detail**: `set local` is transaction-scoped. The snippets do not show `begin` / `rollback`, so copied statements may not preserve simulated auth context.
- **Fix**: Wrap each scenario in `begin; ... rollback;`.
- **Decision**: FIXED - Wrapped repeatable RLS snippets in `begin; ... rollback;`.

### F4 - Implementation commit scopes do not use roadmap task ID

- **Severity**: OBSERVATION
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: Git history
- **Detail**: The accepted lesson says roadmap-linked commits should use scopes like `F-01`. The implementation commits use `finance-domain-foundation`.
- **Fix**: Use `F-01` in future commit scopes; only rewrite existing commits if the branch is local/unshared and you explicitly choose to do so.
- **Decision**: FIXED - Current implementation history uses `F-01` scopes (`8070df7`, `9971ed2`, `acb166f`, `38fa34b`); no rewrite needed.

## Verification Run

- `npx supabase db reset` passed.
- `npx astro check` passed.
- `npm run build` passed.
- `npx eslint src\lib\supabase.ts src\lib\database.types.ts` passed.
- `npm run lint` failed on the documented repo-wide CRLF/Prettier baseline outside this change.
