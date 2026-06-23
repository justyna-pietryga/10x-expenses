---
title: Import Review Completion Guardian Aggregate Refactor
created: 2026-06-19
type: refactor-plan
---

# Import Review Completion Guardian Aggregate Refactor

## STEP 0 - Context

The product is a personal finance app for recurring monthly budget review. The PRD says users need to review bank account data, calculate expenses, and divide those expenses into personal budget categories before they can understand whether they stayed within planned percentages (`context/foundation/prd.md:20`). The primary success criterion is the full loop: import a supported statement, define income and category limits, review and adjust transaction categories with reusable rules, and see a monthly summary (`context/foundation/prd.md:32`). The main business rule consumes imported transactions, categories, reusable rules, and income, then outputs a categorized transaction set and monthly budget summary (`context/foundation/prd.md:97`, `context/foundation/prd.md:99`). The stack is Astro + React + TypeScript + Supabase on Cloudflare Pages, with import/review flows, reusable categorization rules, and monthly summaries called out by the stack decision (`context/foundation/tech-stack.md:24`).

Business logic currently lives in these layers:

| Layer | Current location |
| --- | --- |
| UI workflow | React islands under `src/components/imports/`, especially review dirty-state and completion controls (`src/components/imports/ImportWorkspace.tsx:432`, `src/components/imports/ImportWorkspace.tsx:433`, `src/components/imports/ReviewCompletionBar.tsx:25`). |
| API routes | Astro API routes under `src/pages/api/imports/`, especially bulk review updates and batch completion (`src/pages/api/imports/transactions/bulk.ts:6`, `src/pages/api/imports/batches/[id]/complete.ts:6`). |
| Application/data helpers | Supabase helper functions in `src/lib/imports/data.ts` and summary calculation in `src/lib/summary/data.ts` (`src/lib/imports/data.ts:299`, `src/lib/imports/data.ts:672`, `src/lib/summary/data.ts:261`). |
| Persistence | Supabase tables, constraints, foreign keys, RLS, and migrations under `supabase/migrations/` (`supabase/migrations/20260526103000_finance_domain_foundation.sql:29`, `supabase/migrations/20260526103000_finance_domain_foundation.sql:45`, `supabase/migrations/20260529185000_first_bank_import_review_batch_contract.sql:1`). |

## STEP 1 - Business Invariants

| Invariant | Sources |
| --- | --- |
| Imported statements must belong to one authenticated user, and one user must not see another user's imports, transactions, categories, rules, or summaries. | PRD privacy boundary (`context/foundation/prd.md:90`, `context/foundation/prd.md:91`); batch and transaction rows carry `user_id` (`supabase/migrations/20260526103000_finance_domain_foundation.sql:31`, `supabase/migrations/20260526103000_finance_domain_foundation.sql:47`); RLS scopes batch operations to `auth.uid() = user_id` (`supabase/migrations/20260526103000_finance_domain_foundation.sql:156`, `supabase/migrations/20260526103000_finance_domain_foundation.sql:166`). |
| A supported bank-month import is unique per user and replacement must not duplicate expenses. | PRD replacement rule (`context/foundation/prd.md:59`); unique `(user_id, bank, statement_month)` (`supabase/migrations/20260529185000_first_bank_import_review_batch_contract.sql:16`); commit requires explicit replacement confirmation (`src/lib/imports/data.ts:299`, `src/lib/imports/data.ts:302`), deletes old rows, inserts replacement rows, and resets completion (`src/lib/imports/data.ts:323`, `src/lib/imports/data.ts:332`, `src/lib/imports/data.ts:345`). |
| Imported rows must carry enough detail and valid parsed values before review. | PRD requires detail for review (`context/foundation/prd.md:55`) and accurate parsed amounts/dates (`context/foundation/prd.md:92`); validation requires valid amount, recipient, title, transaction date, supported bank, and CSV file (`src/lib/imports/validation.ts:61`, `src/lib/imports/validation.ts:85`, `src/lib/imports/validation.ts:99`, `src/lib/imports/validation.ts:143`). |
| A transaction included in budget math may be categorized to an owned active category; an excluded transaction must not retain category or rule provenance. | The user can correct categories before relying on summary (`context/foundation/prd.md:56`); single-row update checks owned category when included (`src/lib/imports/data.ts:564`); bulk update rejects inactive/foreign categories per row (`src/lib/imports/data.ts:682`, `src/lib/imports/data.ts:683`); exclusion clears `category_id` and `categorized_by_rule_id` (`src/lib/imports/data.ts:522`, `src/lib/imports/data.ts:523`). |
| Reusable rules can only be created from an included, categorized transaction. | PRD says a correction can be saved as a reusable rule (`context/foundation/prd.md:57`); rule creation is blocked for excluded rows (`src/lib/imports/data.ts:568`) and for missing category (`src/lib/imports/data.ts:575`); rule upsert is scoped by owner and match fields (`src/lib/imports/data.ts:612`, `src/lib/imports/data.ts:623`). |
| A completed review should mean the batch's transactions are trusted enough to feed the monthly summary as reviewed data. | The PRD says the user corrects categories before relying on summary (`context/foundation/prd.md:56`) and the product must show when a summary depends on user-reviewed/corrected categories (`context/foundation/prd.md:93`); the UI labels completion as confirmation before summary reliance (`src/components/imports/ReviewCompletionBar.tsx:48`, `src/components/imports/ReviewCompletionBar.tsx:55`); summary only counts income and categorized spend as reviewed when `review_completed_at` exists (`src/lib/summary/data.ts:278`, `src/lib/summary/data.ts:290`, `src/lib/summary/data.ts:295`). |
| Pending review spend must stay separate from reviewed spend in summaries. | Summary calculation sends uncompleted-batch expense spend into `incompleteReviewSpend` (`src/lib/summary/data.ts:290`, `src/lib/summary/data.ts:291`) and emits warning batches for pending reviews (`src/lib/summary/data.ts:394`, `src/lib/summary/data.ts:395`). |
| Cashflow type controls summary buckets: income is not category spend, expenses are category spend, excluded rows are ignored before cashflow branching. | Summary skips excluded rows before type branching (`src/lib/summary/data.ts:269`, `src/lib/summary/data.ts:275`), completed income increases income basis (`src/lib/summary/data.ts:278`, `src/lib/summary/data.ts:280`), and completed categorized expenses feed category totals (`src/lib/summary/data.ts:295`, `src/lib/summary/data.ts:296`). |

## STEP 2 - Classification and Choice

| Invariant | Core to purpose | Spread across layers | Enforcement status |
| --- | --- | --- | --- |
| User finance ownership boundary | Very high: required for private banking data (`context/foundation/prd.md:90`, `context/foundation/prd.md:91`). | Medium: DB RLS, API auth, query filters. | Enforced strongly by RLS and user-scoped queries. |
| Bank-month replacement without duplication | High: explicit success criterion and import trust rule (`context/foundation/prd.md:59`). | Medium-high: API payload, import helper, DB uniqueness, manual rollback. | Partly enforced; explicit conflict and uniqueness exist, but replacement sequence is not a named aggregate transaction (`src/lib/imports/data.ts:323`, `src/lib/imports/data.ts:365`). |
| Valid parsed import data | High: wrong dates/amounts destroy summary trust (`context/foundation/prd.md:92`). | Medium: parsers, validation, DB constraints. | Mostly enforced for supported formats and payloads. |
| Included/excluded category consistency | High: controls budget math. | Medium: UI review table, single update, bulk update, summary. | Mostly enforced, but bulk saves accumulate per-row failures instead of failing the operation (`src/lib/imports/data.ts:680`, `src/lib/imports/data.ts:699`). |
| Rule creation from corrections | High: reduces repeated manual work (`context/foundation/prd.md:57`). | Medium: UI action, validation, import helper, rules table. | Enforced for excluded/missing-category cases in the single-row path. |
| Completed review means trusted summary input | Very high: the core loop is "review -> rely on summary" (`context/foundation/prd.md:56`, `context/foundation/prd.md:85`, `context/foundation/prd.md:86`). | High: UI dirty-state guard, API route, import data helper, summary math, DB timestamp, tests. | Weakly enforced: server completion only sets `review_completed_at`; no aggregate verifies what "complete" means (`src/lib/imports/data.ts:905`, `src/lib/imports/data.ts:909`). |
| Pending review stays separate from reviewed spend | High: protects summary honesty. | Low-medium: centralized in summary calculation. | Enforced as a projection, not as lifecycle validation. |
| Cashflow summary buckets | Medium-high: protects expense/income math. | Medium: parse validation, DB check, summary. | Enforced in summary and type validation, though not fully as a sign/type DB invariant. |

Chosen invariant: **A completed import review is the only state in which included imported transactions may become trusted reviewed input to monthly summary calculations.**

This is the best #1 refactor target because it sits directly on the product's value proof: the user reviews imported transactions before relying on a summary (`context/foundation/prd.md:56`) and the summary is explicitly the main proof that the product works (`context/foundation/prd.md:85`, `context/foundation/prd.md:86`). It is also the weakest core invariant because the server has no domain concept of "review completeness"; it writes a timestamp when the route is called (`src/pages/api/imports/batches/[id]/complete.ts:8`, `src/pages/api/imports/batches/[id]/complete.ts:10`, `src/lib/imports/data.ts:905`, `src/lib/imports/data.ts:909`). The UI blocks completion when there are unsaved local drafts (`src/components/imports/ImportWorkspace.tsx:432`, `src/components/imports/ImportWorkspace.tsx:433`), but a direct API call bypasses that state completely. Summary calculation then treats the timestamp as the boundary between incomplete and reviewed buckets (`src/lib/summary/data.ts:278`, `src/lib/summary/data.ts:290`, `src/lib/summary/data.ts:295`), so a weak transition leaks into the product's most important read model.

## STEP 3 - Diagnosis of the Chosen Invariant

### Where the Rule Lives Today

**Requirements.** The PRD requires user review before reliance: "The user can correct transaction categories before relying on the summary" (`context/foundation/prd.md:56`). It also requires clarity when a summary depends on reviewed/corrected categories (`context/foundation/prd.md:93`) and says the rule recalculates category usage after import correction and rule recording (`context/foundation/prd.md:101`).

**Persistence.** The database only has a nullable timestamp: `review_completed_at timestamptz` (`supabase/migrations/20260529185000_first_bank_import_review_batch_contract.sql:1`, `supabase/migrations/20260529185000_first_bank_import_review_batch_contract.sql:3`). There is no database constraint for "completed batches must have no included uncategorized expenses" or any other completeness definition. Batch ownership is enforced (`supabase/migrations/20260526103000_finance_domain_foundation.sql:166`, `supabase/migrations/20260526103000_finance_domain_foundation.sql:170`), but lifecycle validity is not.

**Import commit.** Replacing a batch resets `review_completed_at` to null (`src/lib/imports/data.ts:339`, `src/lib/imports/data.ts:345`), which is correct. The replacement operation itself is assembled from separate Supabase calls and a manual restore path (`src/lib/imports/data.ts:323`, `src/lib/imports/data.ts:332`, `src/lib/imports/data.ts:365`, `src/lib/imports/data.ts:373`), so the import batch lifecycle is not owned by a transactional aggregate.

**Review updates.** Single-row review updates enforce owned categories for included rows (`src/lib/imports/data.ts:564`, `src/lib/imports/data.ts:565`) and rule creation preconditions (`src/lib/imports/data.ts:568`, `src/lib/imports/data.ts:575`). Bulk review updates validate active categories, but invalid rows are appended to `failed` and the loop continues (`src/lib/imports/data.ts:680`, `src/lib/imports/data.ts:683`, `src/lib/imports/data.ts:699`, `src/lib/imports/data.ts:704`). That behavior is useful for partial UI saves, but it is not fail-fast aggregate behavior for operations that change the trust boundary.

**Completion route.** The API route only authenticates, parses the path id, and delegates to a helper (`src/pages/api/imports/batches/[id]/complete.ts:8`, `src/pages/api/imports/batches/[id]/complete.ts:9`, `src/pages/api/imports/batches/[id]/complete.ts:10`). The helper only sets `review_completed_at` and filters by owner (`src/lib/imports/data.ts:905`, `src/lib/imports/data.ts:909`, `src/lib/imports/data.ts:911`, `src/lib/imports/data.ts:912`). No transaction rows are loaded and no completion preconditions are checked.

**UI.** `handleCompleteReview` returns early if local state has dirty review changes (`src/components/imports/ImportWorkspace.tsx:432`, `src/components/imports/ImportWorkspace.tsx:433`). `ReviewCompletionBar` also returns early when blocked (`src/components/imports/ReviewCompletionBar.tsx:25`, `src/components/imports/ReviewCompletionBar.tsx:26`) and disables the button (`src/components/imports/ReviewCompletionBar.tsx:76`, `src/components/imports/ReviewCompletionBar.tsx:79`). This is the only guardian against completing with unsaved client-side changes. It does not protect direct API calls, a second tab, or server-side state that is already invalid.

**Summary.** The summary treats completion as authoritative. Completed income increases total income (`src/lib/summary/data.ts:278`, `src/lib/summary/data.ts:280`), pending expense spend is separated as incomplete (`src/lib/summary/data.ts:290`, `src/lib/summary/data.ts:291`), completed categorized spend feeds category totals (`src/lib/summary/data.ts:295`, `src/lib/summary/data.ts:296`), and completed but uncategorized spend is still a separate reviewed bucket (`src/lib/summary/data.ts:304`). That last bucket is evidence of an ambiguous domain meaning: the system allows a batch to be "review complete" while still having included uncategorized expense spend.

### Gaps

- The server does not enforce review completion preconditions. The completion transition is a timestamp update, not a domain method.
- The UI is the only guardian for unsaved drafts, and unsaved drafts are not part of server state.
- Bulk review updates swallow row-level errors by returning `failed` while applying other rows (`src/lib/imports/data.ts:680`, `src/lib/imports/data.ts:699`, `src/lib/imports/data.ts:707`). That is acceptable for "save what can be saved", but not for the finalization boundary.
- The summary compensates after the fact with `reviewed_uncategorized_spend` and `warning_batches` (`src/lib/summary/data.ts:388`, `src/lib/summary/data.ts:390`, `src/lib/summary/data.ts:394`) instead of the domain preventing illegal completion states.
- There is no single transaction that loads the batch, validates transactions, applies state changes, and saves the lifecycle transition.

## STEP 4 - Guardian Aggregate Design

### Aggregate Root

Name: `ImportReviewBatch`

Boundary: one user's one supported-bank statement month and its imported transactions. The aggregate root owns:

- batch identity: `batchId`, `userId`, `bank`, `statementMonth`, `reviewCompletedAt`
- child rows: imported transactions for the batch with `id`, `amount`, `cashflowType`, `categoryId`, `isIncluded`, `categorizedByRuleId`
- allowed operations: replace import, apply review updates, create rule from correction, complete review

Invariant to enforce in one place:

> A batch can be marked review-complete only when every included expense transaction is explicitly reviewed: either categorized to an owned active category or excluded. The transition must fail fast with a named domain error; it must not silently mark completion while leaving invalid included expense rows.

This makes a deliberate domain choice. Today the product allows "reviewed uncategorized expense spend" (`src/lib/summary/data.ts:304`), but the requirements say correction happens before relying on the summary (`context/foundation/prd.md:56`). The refactor should either rename current completion to "user acknowledged review" or enforce "complete means trusted"; this plan chooses the stricter invariant because the user asked for a guardian aggregate and fail-fast behavior.

### Domain Errors

```ts
class ImportReviewDomainError extends Error {
  code: string;
  field?: string;
  status: number;
}

class ImportBatchNotFound extends ImportReviewDomainError {
  code = "IMPORT_BATCH_NOT_FOUND";
  status = 404;
}

class ReviewCompletionBlocked extends ImportReviewDomainError {
  code = "REVIEW_COMPLETION_BLOCKED";
  status = 409;
  details: {
    uncategorizedIncludedExpenseIds: string[];
  };
}

class InvalidReviewCategory extends ImportReviewDomainError {
  code = "INVALID_REVIEW_CATEGORY";
  status = 400;
  field = "category_id";
}

class ExcludedTransactionCannotCreateRule extends ImportReviewDomainError {
  code = "EXCLUDED_TRANSACTION_CANNOT_CREATE_RULE";
  status = 400;
  field = "save_rule";
}
```

### Aggregate Methods

```ts
type ReviewUpdate = {
  transactionId: string;
  categoryId: string | null;
  isIncluded: boolean;
};

class ImportReviewBatch {
  completeReview(now: Date): void {
    const blockers = this.transactions
      .filter((transaction) => transaction.isIncluded)
      .filter((transaction) => transaction.cashflowType === "expense")
      .filter((transaction) => transaction.spendAmount > 0)
      .filter((transaction) => transaction.categoryId === null);

    if (blockers.length > 0) {
      throw new ReviewCompletionBlocked({
        uncategorizedIncludedExpenseIds: blockers.map((transaction) => transaction.id),
      });
    }

    this.reviewCompletedAt = now.toISOString();
  }

  applyReviewUpdate(update: ReviewUpdate, activeCategoryIds: Set<string>): void {
    const transaction = this.getTransaction(update.transactionId);

    if (!update.isIncluded) {
      transaction.excludeFromBudget();
      return;
    }

    if (update.categoryId !== null && !activeCategoryIds.has(update.categoryId)) {
      throw new InvalidReviewCategory();
    }

    transaction.includeInBudget(update.categoryId);
  }

  createRuleFromReviewedTransaction(transactionId: string, categoryId: string): RuleDraft {
    const transaction = this.getTransaction(transactionId);

    if (!transaction.isIncluded) {
      throw new ExcludedTransactionCannotCreateRule();
    }

    if (!categoryId) {
      throw new InvalidReviewCategory();
    }

    return RuleDraft.fromRecipientMatch(this.userId, transaction.recipient, categoryId);
  }

  replaceWithConfirmedImport(importDraft: ParsedImportBatch, rules: CategorizationRule[], now: Date): void {
    if (!importDraft.confirmReplace && this.exists) {
      throw new ReplacementConfirmationRequired();
    }

    this.transactions = importDraft.transactions.map((transaction) =>
      ImportedTransaction.fromParsedRow(transaction).applyMatchingRule(rules),
    );
    this.periodStart = importDraft.periodStart;
    this.periodEnd = importDraft.periodEnd;
    this.sourceFilename = importDraft.sourceFilename;
    this.importedAt = now.toISOString();
    this.reviewCompletedAt = null;
  }
}
```

### Repository

Name: `ImportReviewBatchRepository`

The repository loads and saves the aggregate. It replaces scattered `statement_import_batches` and `transactions` queries in completion and review lifecycle operations.

```ts
interface ImportReviewBatchRepository {
  loadForUpdate(userId: string, batchId: string): Promise<ImportReviewBatch>;
  loadByBankMonthForUpdate(userId: string, bank: SupportedBank, statementMonth: string): Promise<ImportReviewBatch | null>;
  save(batch: ImportReviewBatch): Promise<void>;
  transaction<T>(work: (repo: ImportReviewBatchRepository) => Promise<T>): Promise<T>;
}
```

Atomic completion:

```ts
await importReviewBatchRepository.transaction(async (repo) => {
  const batch = await repo.loadForUpdate(userId, batchId);
  batch.completeReview(clock.now());
  await repo.save(batch);
});
```

Atomic replacement:

```ts
await importReviewBatchRepository.transaction(async (repo) => {
  const batch = await repo.loadByBankMonthForUpdate(userId, bank, statementMonth)
    ?? ImportReviewBatch.new(userId, bank, statementMonth);

  batch.replaceWithConfirmedImport(payload, rules, clock.now());
  await repo.save(batch);
});
```

Implementation note: Supabase client-side chained calls do not expose a multi-statement transaction boundary for these helpers. Add a database RPC such as `complete_import_review_batch(user_id, batch_id)` or `replace_import_batch(...)` that performs `select ... for update`, validates children, updates the batch, and returns the updated aggregate snapshot. The TypeScript repository becomes the domain-facing adapter over that RPC. The aggregate and database function should share the same invariant tests so the server and persistence boundary do not diverge.

### Thin Route

```ts
export const POST: APIRoute = async (context) => {
  try {
    const { user } = requireImportAuth(context);
    const batchId = requirePathId(context.params.id, "batch_id");

    const batch = await completeImportReviewBatch({
      batchId,
      userId: user.id,
    });

    return importJson({ batch }, 200);
  } catch (error) {
    return importDomainErrorResponse(error);
  }
};
```

The route parses input and maps domain errors. It does not decide whether completion is allowed. UI can still disable the button for local dirty state, but server enforcement becomes authoritative.

## STEP 5 - Before/After, Plan, Tests

### Before/After

| Current place | Before | After |
| --- | --- | --- |
| `src/components/imports/ImportWorkspace.tsx` | Blocks completion only when `hasDirtyReviewChanges` is true (`src/components/imports/ImportWorkspace.tsx:432`, `src/components/imports/ImportWorkspace.tsx:433`). | Keeps the UX guard for drafts, but treats server `ReviewCompletionBlocked` as authoritative and displays the returned blocker count/rows. |
| `src/components/imports/ReviewCompletionBar.tsx` | Disables button from UI state (`src/components/imports/ReviewCompletionBar.tsx:76`, `src/components/imports/ReviewCompletionBar.tsx:79`). | Remains a presentation component; no invariant ownership. |
| `src/pages/api/imports/batches/[id]/complete.ts` | Auth, id parse, direct helper call (`src/pages/api/imports/batches/[id]/complete.ts:8`, `src/pages/api/imports/batches/[id]/complete.ts:10`). | Auth, id parse, aggregate application service call, domain error mapping. |
| `src/lib/imports/data.ts:markBatchReviewComplete` | Updates `review_completed_at` without loading transactions (`src/lib/imports/data.ts:905`, `src/lib/imports/data.ts:909`). | Replaced by `ImportReviewBatch.completeReview()` through repository transaction/RPC. |
| `src/lib/imports/data.ts:updateImportTransactionReviews` | Applies valid rows and returns failed rows (`src/lib/imports/data.ts:680`, `src/lib/imports/data.ts:699`, `src/lib/imports/data.ts:707`). | Keep partial bulk-save route if desired, but aggregate-level completion must fail if any included expense remains uncategorized. Add separate all-or-nothing review update method for finalization flows. |
| `src/lib/summary/data.ts` | Treats `review_completed_at` as trusted and still supports reviewed uncategorized spend (`src/lib/summary/data.ts:295`, `src/lib/summary/data.ts:304`). | With strict completion, `reviewed_uncategorized_spend` should only reflect legacy data or be renamed as an anomaly bucket. The normal path cannot create new completed uncategorized included expenses. |
| Supabase migrations | Only stores `review_completed_at` (`supabase/migrations/20260529185000_first_bank_import_review_batch_contract.sql:3`). | Add transaction/RPC-level guard for completion. Optional later schema support: `review_state` enum and `review_completed_at` consistency check. |
| Tests | Completion helper/route tests assert timestamp existence (`tests/review-persistence-and-rule-application.test.ts:889`, `tests/review-persistence-and-rule-application.test.ts:901`). | Tests assert legal completion, blocked completion, route error mapping, and transaction atomicity. |

### Refactoring Phases

1. **Characterize current behavior, test-first.**
   - Add failing tests that document the desired invariant before code changes.
   - Test cases:
     - Legal: all included expense rows have active category ids; completion succeeds.
     - Legal: excluded expense with `category_id = null` does not block completion.
     - Legal: included income with `category_id = null` does not block completion.
     - Illegal: included expense with `category_id = null` blocks completion with `ReviewCompletionBlocked`.
     - Illegal: missing/foreign batch returns `ImportBatchNotFound`, not a generic persistence error.
     - Illegal: direct API call cannot bypass UI dirty-state intent once persisted state is invalid.

2. **Introduce domain names behind existing helpers, test-first.**
   - Add `ImportReviewBatch`, `ImportedTransactionReviewLine`, and named domain errors.
   - Move the completion predicate into `ImportReviewBatch.completeReview(now)`.
   - Keep existing Supabase queries initially, but make `markBatchReviewComplete` call the domain method after loading batch transactions.

3. **Create repository and all-or-nothing completion transaction, test-first.**
   - Add `ImportReviewBatchRepository`.
   - Implement completion through one transaction boundary. If Supabase chained calls cannot provide this safely, add a Postgres RPC and wrap it in the repository.
   - Test atomicity: if validation fails, `review_completed_at` remains null.

4. **Move replacement under the same aggregate.**
   - Refactor bank-month replacement to `replaceWithConfirmedImport`.
   - Replace manual delete/insert/restore behavior with a single transaction/RPC.
   - Test that replacement clears completion and cannot leave a batch with zero old rows and partial new rows after an insert failure.

5. **Align route and UI contracts.**
   - Route maps `ReviewCompletionBlocked` to `409` with blocker details.
   - UI keeps local draft blocking, then displays server blockers if the aggregate refuses completion.
   - E2E test: save categories, complete, and verify summary no longer carries incomplete spend for that batch.

6. **Simplify summary assumptions after migration.**
   - Decide whether `reviewed_uncategorized_spend` remains as a legacy/anomaly field or is removed from normal copy.
   - Add regression tests that completed batches cannot newly contribute uncategorized included expense spend.

### Load-Bearing Names to Register

No explicit contract registry was found in the inspected project files. If the project starts one, register these names:

- `ImportReviewBatch`
- `ImportedTransactionReviewLine`
- `ReviewCompletionBlocked`
- `InvalidReviewCategory`
- `ExcludedTransactionCannotCreateRule`
- `ImportReviewBatchRepository`
- `completeImportReviewBatch`
- `replaceImportBatch`

## Summary

The most important weak invariant is the trust boundary between imported transaction review and monthly summary calculation. Today, `review_completed_at` is treated as authoritative by summary logic, but the server marks it without checking whether included expense rows are actually review-complete. The UI blocks only unsaved local drafts, which protects the happy path but cannot enforce the domain rule against direct API calls or inconsistent persisted state. The proposed aggregate, `ImportReviewBatch`, owns review updates, rule-creation preconditions, replacement, and the `completeReview` transition. Illegal completion throws `ReviewCompletionBlocked` and leaves state unchanged. The repository should load and save the aggregate through one transaction, preferably via a Postgres RPC for atomic validation and update. The refactor should start test-first around legal completion, excluded rows, income rows, uncategorized expense blockers, and atomic failure behavior.
