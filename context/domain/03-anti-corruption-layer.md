---
title: Supabase Anti-Corruption Layer Refactor Plan
created: 2026-06-19
type: refactor-plan
---

## Step 0 - Context

The app is an Astro 6 / React 19 / TypeScript 5 expenses product. The package manifest declares Supabase as both runtime SDKs and CLI: `@supabase/ssr` at `package.json:27`, `@supabase/supabase-js` at `package.json:28`, and `supabase` at `package.json:59`. The README presents Supabase as "Authentication and backend-as-a-service" at `README.md:13`, and says its environment variables are server-only and "never exposed to the client" at `README.md:94`.

The product requirements make ownership and data privacy domain-critical: account login protects banking data and saved history at `context/foundation/prd.md:64`, and users must only access their own imported statements, transactions, categories, limits, rules, and summaries at `context/foundation/prd.md:91`. The stack decision explicitly keeps auth and data access close to the starter conventions at `context/foundation/tech-stack.md:24`, while the test plan says the app should test "our contracts and ownership rules, not Supabase internals" at `context/foundation/test-plan.md:149`. That means Supabase is acceptable infrastructure, but its query DSL and generated row types should not define the domain contract.

Current code layers:

- Runtime shell: `src/middleware.ts`, Astro pages under `src/pages/`, API handlers under `src/pages/api/`.
- UI islands: React components under `src/components/`.
- Feature/application services: `src/lib/{imports,budget,rules,summary}/http.ts`, validation files, and data files.
- Persistence/infrastructure: currently mixed into `src/lib/{imports,budget,rules,summary}/data.ts` plus `src/lib/supabase.ts`.
- Database schema shape: `src/lib/database.types.ts` and `supabase/migrations/`.

## Step 1 - Identified Leaking Dependencies

### Candidate A - Supabase

Files that know Supabase or Supabase-generated shapes today:

- `package.json:27` declares `@supabase/ssr`.
- `package.json:28` declares `@supabase/supabase-js`.
- `package.json:59` declares the Supabase CLI.
- `README.md:13` declares Supabase as backend/auth infrastructure.
- `README.md:94` documents Supabase configuration as server-only.
- `context/foundation/roadmap.md:57` names Supabase data integration.
- `context/foundation/roadmap.md:58` names Supabase auth and route protection.
- `context/foundation/infrastructure.md:66` says Supabase is external from day one.
- `context/foundation/test-plan.md:149` says tests should target app contracts, not Supabase internals.
- `src/env.d.ts:3` exposes `import("@supabase/supabase-js").User` in `App.Locals`.
- `src/lib/supabase.ts:1` imports `createServerClient` and `parseCookieHeader` from `@supabase/ssr`.
- `src/lib/supabase.ts:10` creates `createServerClient<Database>`.
- `src/middleware.ts:2` imports `createClient` from the Supabase wrapper.
- `src/middleware.ts:12` calls `supabase.auth.getUser()`.
- `src/pages/imports.astro:16` imports the Supabase wrapper.
- `src/pages/imports.astro:20` creates a Supabase client in a page.
- `src/pages/dashboard.astro:10` imports the Supabase wrapper.
- `src/pages/dashboard.astro:13` creates a Supabase client in a page.
- `src/pages/budget.astro:7` imports the Supabase wrapper.
- `src/pages/budget.astro:14` creates a Supabase client in a page.
- `src/pages/api/auth/signup.ts:2` imports the Supabase wrapper.
- `src/pages/api/auth/signup.ts:13` calls `supabase.auth.signUp`.
- `src/pages/api/auth/signin.ts:2` imports the Supabase wrapper.
- `src/pages/api/auth/signin.ts:13` calls `supabase.auth.signInWithPassword`.
- `src/pages/api/auth/signout.ts:2` imports the Supabase wrapper.
- `src/pages/api/auth/signout.ts:7` calls `supabase.auth.signOut`.
- `src/lib/budget/http.ts:2` imports the Supabase wrapper.
- `src/lib/budget/http.ts:16` creates a Supabase client.
- `src/lib/imports/http.ts:2` imports the Supabase wrapper.
- `src/lib/imports/http.ts:16` creates a Supabase client.
- `src/lib/summary/http.ts:6` imports the Supabase wrapper.
- `src/lib/summary/http.ts:19` creates a Supabase client.
- `src/lib/budget/data.ts:1` imports `PostgrestError` and `SupabaseClient`.
- `src/lib/budget/data.ts:3` imports generated `Database` and `Tables`.
- `src/lib/budget/data.ts:5` aliases `BudgetClient = SupabaseClient<Database>`.
- `src/lib/budget/data.ts:7` exports a domain-facing type from `Tables<"budget_categories">`.
- `src/lib/budget/data.ts:8` exports a domain-facing type from `Tables<"monthly_incomes">`.
- `src/lib/budget/data.ts:10` maps `PostgrestError`.
- `src/lib/imports/data.ts:1` imports `PostgrestError` and `SupabaseClient`.
- `src/lib/imports/data.ts:3` imports generated `Database` and `Tables`.
- `src/lib/imports/data.ts:13` aliases `ImportClient = SupabaseClient<Database>`.
- `src/lib/imports/data.ts:16` exports `ImportBatch = Tables<"statement_import_batches">`.
- `src/lib/imports/data.ts:17` exports `ImportedTransaction = Tables<"transactions">`.
- `src/lib/imports/data.ts:70` maps `PostgrestError`.
- `src/lib/imports/data.ts:299` accepts `supabase: ImportClient` in `commitImportBatch`.
- `src/lib/rules/data.ts:1` imports `PostgrestError` and `SupabaseClient`.
- `src/lib/rules/data.ts:3` imports generated `Database` and `Tables`.
- `src/lib/rules/data.ts:7` aliases `RulesClient = SupabaseClient<Database>`.
- `src/lib/rules/data.ts:9` exports `CategorizationRule = Tables<"categorization_rules">`.
- `src/lib/rules/data.ts:17` maps `PostgrestError`.
- `src/lib/summary/data.ts:1` imports `PostgrestError` and `SupabaseClient`.
- `src/lib/summary/data.ts:3` imports generated `Database`, `Json`, and `Tables`.
- `src/lib/summary/data.ts:6` aliases `SummaryClient = SupabaseClient<Database>`.
- `src/lib/summary/data.ts:51` maps `PostgrestError`.
- `src/lib/budget/validation.ts:1` imports `Tables` from generated database types.
- `tests/budget-setup.test.ts:2` imports the Supabase wrapper.
- `tests/budget-setup.test.ts:87` reconstructs a Supabase-like `.from()` client.
- `tests/import-review.test.ts:37` imports the Supabase wrapper.
- `tests/import-review.test.ts:51` imports generated `Database`.
- `tests/import-review.test.ts:168` builds an import Supabase stub.
- `tests/import-review.test.ts:270` reconstructs `.from(table: string)`.
- `tests/import-review.test.ts:439` builds a bulk import Supabase stub.
- `tests/import-review.test.ts:474` reconstructs `.from(table: string)`.
- `tests/import-review.test.ts:540` builds an import-review rule Supabase stub.
- `tests/import-review.test.ts:602` reconstructs `.from(table: string)`.
- `tests/import-review.test.ts:705` builds an import-history Supabase stub.
- `tests/import-review.test.ts:824` reconstructs `.from(table: string)`.
- `tests/import-review.test.ts:1614` reconstructs `.from(table: string)`.
- `tests/monthly-summary-and-rules.test.ts:12` imports the Supabase wrapper.
- `tests/monthly-summary-and-rules.test.ts:116` builds a summary Supabase stub.
- `tests/monthly-summary-and-rules.test.ts:268` reconstructs `.from(table: string)`.
- `tests/review-persistence-and-rule-application.test.ts:19` imports the Supabase wrapper.
- `tests/review-persistence-and-rule-application.test.ts:150` builds a phase-2 Supabase stub.
- `tests/review-persistence-and-rule-application.test.ts:192` reconstructs `.from(table: string)`.
- `tests/auth-and-ownership-boundaries.test.ts:4` imports the Supabase wrapper.
- `tests/auth-and-ownership-boundaries.test.ts:234` builds an ownership Supabase stub.

Leak signals:

- The SDK client type appears in domain-facing data function signatures, for example `src/lib/imports/data.ts:299`.
- Generated persistence table types are exported as application/domain types at `src/lib/imports/data.ts:16`, `src/lib/imports/data.ts:17`, `src/lib/budget/data.ts:7`, `src/lib/budget/data.ts:8`, and `src/lib/rules/data.ts:9`.
- PostgREST errors are mapped separately in four feature services at `src/lib/budget/data.ts:10`, `src/lib/imports/data.ts:70`, `src/lib/rules/data.ts:17`, and `src/lib/summary/data.ts:51`.
- Tests repeatedly reconstruct Supabase's fluent query API, for example `tests/import-review.test.ts:270`, `tests/monthly-summary-and-rules.test.ts:268`, and `tests/review-persistence-and-rule-application.test.ts:192`.
- Auth uses Supabase directly in API handlers and middleware at `src/middleware.ts:12`, `src/pages/api/auth/signup.ts:13`, `src/pages/api/auth/signin.ts:13`, and `src/pages/api/auth/signout.ts:7`.

### Candidate B - Bank CSV Format Knowledge

This is a domain-format leak, not an external package leak. It still matters because bank identifiers and presentation copies cross UI/API/parser boundaries:

- `src/lib/imports/types.ts:1` defines `SupportedBank = "revolut" | "ing"`.
- `src/lib/imports/validation.ts:85` validates supported banks.
- `src/lib/imports/validation.ts:96` hard-codes the Revolut/ING support message.
- `src/pages/api/imports/preview.ts:9` branches parser selection by bank.
- `src/pages/api/imports/preview.ts:11` calls the Revolut parser.
- `src/pages/api/imports/preview.ts:14` calls the ING parser.
- `src/components/imports/ImportUploadForm.tsx:25` defines bank copy in the UI.
- `src/components/imports/ImportUploadForm.tsx:122` enumerates `["revolut", "ing"]`.
- `src/components/imports/ImportHistory.tsx:14` formats the bank label in a UI component.

This is lower priority for an ACL plan because there is no third-party SDK or persistence driver leaking through signatures. It should be handled by an import-format registry later.

### Candidate C - UI Utility Dependencies

`clsx`, `tailwind-merge`, and `class-variance-authority` are visible in UI-only helpers: `src/lib/utils.ts:1`, `src/lib/utils.ts:2`, and `src/components/ui/button.tsx:3`. These do not cross into domain logic or persistence and are not selected.

## Step 2 - Classification and Selected Leak

Supabase is the #1 leak.

| Candidate | Layers/files affected | Replacement cost today | Declared replaceability / intent divergence | Decision |
| --- | --- | --- | --- | --- |
| Supabase | Package, docs, middleware, pages, API auth, feature HTTP helpers, four data services, generated types, tests | High: replacing it means changing auth, repository signatures, table type aliases, error mapping, and many test stubs | Strong divergence: docs and tests say Supabase is infrastructure and tests should target app contracts, not Supabase internals (`context/foundation/test-plan.md:149`) | Selected |
| Bank CSV formats | Parser, validation, API preview, UI upload/history | Medium: adding a bank touches several places | PRD deliberately says explicit supported-bank model at `context/foundation/prd.md:42` and no universal parser at `context/foundation/prd.md:111` | Not an external dependency leak |
| UI utilities | UI primitives only | Low | No domain replaceability intent | Not a domain boundary problem |

Supabase is worst because it is both an auth provider and persistence provider, and its concrete types are used as the seam between HTTP handlers and domain-ish services. The dangerous leak is not a confirmed client bundle import of the SDK in React islands; the dangerous leak is that domain/application contracts now require callers and tests to know Supabase's client and generated table shapes.

## Step 3 - Diagnosis

### Duplication of Persistence Error Mapping

The same vendor error type is interpreted in multiple feature modules:

- `src/lib/budget/data.ts:1` imports `PostgrestError`.
- `src/lib/budget/data.ts:10` maps `PostgrestError`.
- `src/lib/imports/data.ts:1` imports `PostgrestError`.
- `src/lib/imports/data.ts:70` maps `PostgrestError`.
- `src/lib/rules/data.ts:1` imports `PostgrestError`.
- `src/lib/rules/data.ts:17` maps `PostgrestError`.
- `src/lib/summary/data.ts:1` imports `PostgrestError`.
- `src/lib/summary/data.ts:51` maps `PostgrestError`.

The duplicate mapping means a change in Supabase/PostgREST error shape must be audited in four places. That contradicts the test-plan boundary that tests should validate the app's contracts instead of Supabase internals at `context/foundation/test-plan.md:149`.

### Domain Types Are Persistence Rows

The import module exports row aliases as its public model:

- `src/lib/imports/data.ts:16` exports `ImportBatch = Tables<"statement_import_batches">`.
- `src/lib/imports/data.ts:17` exports `ImportedTransaction = Tables<"transactions">`.
- `src/lib/imports/data.ts:26` exposes `ImportBatchReview` using those exported row types.

The same happens in budget and rules:

- `src/lib/budget/data.ts:7` exports `BudgetCategory = Tables<"budget_categories">`.
- `src/lib/budget/data.ts:8` exports `MonthlyIncome = Tables<"monthly_incomes">`.
- `src/lib/rules/data.ts:9` exports `CategorizationRule = Tables<"categorization_rules">`.

This turns generated database row structure into the app's domain API. A table rename, column rename, enum change, or vendor type generation change would flow into UI and API call sites even if the domain concept did not change.

### Supabase Client in Application Signatures

Feature services accept the concrete client as an argument:

- `src/lib/budget/data.ts:5` defines `BudgetClient = SupabaseClient<Database>`.
- `src/lib/budget/data.ts:26` takes `supabase: BudgetClient`.
- `src/lib/imports/data.ts:13` defines `ImportClient = SupabaseClient<Database>`.
- `src/lib/imports/data.ts:299` takes `supabase: ImportClient`.
- `src/lib/rules/data.ts:7` defines `RulesClient = SupabaseClient<Database>`.
- `src/lib/summary/data.ts:6` defines `SummaryClient = SupabaseClient<Database>`.

The result is dependency inversion in name only: the caller owns a Supabase client and passes it downward, so every service test must either use a real client or reconstruct the fluent API.

### Tests Rebuild the Vendor Query DSL

Tests duplicate the shape of Supabase's `.from().select().eq().single()` style chains:

- `tests/budget-setup.test.ts:87` reconstructs `.from(table: string)`.
- `tests/import-review.test.ts:270` reconstructs `.from(table: string)`.
- `tests/import-review.test.ts:474` reconstructs `.from(table: string)`.
- `tests/import-review.test.ts:602` reconstructs `.from(table: string)`.
- `tests/import-review.test.ts:824` reconstructs `.from(table: string)`.
- `tests/monthly-summary-and-rules.test.ts:268` reconstructs `.from(table: string)`.
- `tests/review-persistence-and-rule-application.test.ts:192` reconstructs `.from(table: string)`.

This is the clearest symptom of the leak. Tests that should describe expense behavior and ownership rules are forced to mimic infrastructure mechanics.

### Auth Boundary Leak

Auth currently exposes Supabase directly at framework boundaries:

- `src/env.d.ts:3` stores a Supabase `User` in `App.Locals`.
- `src/middleware.ts:12` calls `supabase.auth.getUser()`.
- `src/pages/api/auth/signup.ts:13` calls `supabase.auth.signUp`.
- `src/pages/api/auth/signin.ts:13` calls `supabase.auth.signInWithPassword`.
- `src/pages/api/auth/signout.ts:7` calls `supabase.auth.signOut`.

Given the README's server-only Supabase configuration rule at `README.md:94`, the design should keep all Supabase SDK knowledge in server-only infrastructure modules. The current React islands do not directly import `@supabase/supabase-js`, but the framework-wide `App.Locals` type and API route code still expose Supabase as the app's auth model.

## Step 4 - ACL Design

### Target Dependency Boundary

Create one infrastructure boundary under `src/lib/infrastructure/supabase/` and keep all `@supabase/*`, generated `Database`, `Tables`, `Json`, `PostgrestError`, and `createServerClient` usage inside it.

Proposed files:

- `src/lib/domain/auth/user-session.ts`
- `src/lib/domain/finance/models.ts`
- `src/lib/domain/finance/repositories.ts`
- `src/lib/infrastructure/supabase/client.ts`
- `src/lib/infrastructure/supabase/auth-adapter.ts`
- `src/lib/infrastructure/supabase/finance-repository.ts`
- `src/lib/infrastructure/supabase/mappers.ts`
- `src/lib/infrastructure/supabase/errors.ts`

### Domain Value Objects and Entities

The domain should own stable concepts instead of generated row aliases.

```ts
// src/lib/domain/auth/user-session.ts
export interface AuthenticatedUser {
  id: UserId;
  email: string | null;
}

export class UserId {
  private constructor(readonly value: string) {}

  static fromString(value: string): UserId {
    // validate non-empty UUID-ish/provider id string
    return new UserId(value);
  }
}
```

```ts
// src/lib/domain/finance/models.ts
export type BankCode = "revolut" | "ing";
export type CashflowType = "expense" | "income";

export class StatementMonth {
  private constructor(readonly isoDate: string) {}

  static fromTransactionDate(date: LocalDate): StatementMonth;
  static fromPersistence(value: string): StatementMonth;
  toPersistence(): string;
}

export class MoneyAmount {
  private constructor(readonly value: number) {}

  static fromSignedStatementAmount(value: number): MoneyAmount;
  isExpense(): boolean;
  cashflowType(): CashflowType;
  toPersistence(): number;
}

export interface ImportBatch {
  id: string;
  ownerId: UserId;
  bank: BankCode;
  statementMonth: StatementMonth;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  sourceFilename: string | null;
  importedAt: Instant;
  reviewCompletedAt: Instant | null;
}

export interface ImportedTransaction {
  id: string;
  ownerId: UserId;
  batchId: string;
  transactionDate: LocalDate;
  title: string;
  recipient: string;
  amount: MoneyAmount;
  cashflowType: CashflowType;
  categoryId: string | null;
  includedInSummary: boolean;
  categorizedByRuleId: string | null;
}

export interface ImportBatchReview {
  batch: ImportBatch;
  transactions: ReviewedImportedTransaction[];
}
```

Only `src/lib/infrastructure/supabase/mappers.ts` should know how these map to Supabase rows:

```ts
// src/lib/infrastructure/supabase/mappers.ts
import type { Tables } from "@/lib/database.types";

type BatchRow = Tables<"statement_import_batches">;
type TransactionRow = Tables<"transactions">;

export function batchFromRow(row: BatchRow): ImportBatch;
export function batchToInsert(batch: NewImportBatch): Database["public"]["Tables"]["statement_import_batches"]["Insert"];
export function transactionFromRow(row: TransactionRow): ImportedTransaction;
export function transactionToInsert(tx: NewImportedTransaction): Database["public"]["Tables"]["transactions"]["Insert"];
```

### Narrow Ports

Split the port by use case, not by Supabase table. This keeps each feature dependent on behavior it needs, not a generic database client.

```ts
// src/lib/domain/finance/repositories.ts
export interface AuthSessionPort {
  currentUser(request: HttpRequestContext): Promise<AuthenticatedUser | null>;
  signInWithPassword(input: EmailPasswordCredentials, context: HttpRequestContext): Promise<AuthResult>;
  signUpWithPassword(input: EmailPasswordCredentials, context: HttpRequestContext): Promise<AuthResult>;
  signOut(context: HttpRequestContext): Promise<void>;
}

export interface BudgetRepository {
  listActiveCategories(ownerId: UserId): Promise<BudgetCategory[]>;
  loadMonthlyIncome(ownerId: UserId, month: StatementMonth): Promise<MonthlyIncome | null>;
  saveMonthlyIncome(ownerId: UserId, income: MonthlyIncomeDraft): Promise<MonthlyIncome>;
  createCategory(ownerId: UserId, draft: BudgetCategoryDraft): Promise<BudgetCategory>;
  updateCategory(ownerId: UserId, categoryId: string, changes: BudgetCategoryChanges): Promise<BudgetCategory>;
  archiveCategory(ownerId: UserId, categoryId: string): Promise<BudgetCategory>;
}

export interface ImportRepository {
  findExistingBatch(ownerId: UserId, bank: BankCode, month: StatementMonth): Promise<ImportBatch | null>;
  saveReplacementBatch(ownerId: UserId, command: CommitImportBatchCommand): Promise<ImportBatchReview>;
  loadBatchReview(ownerId: UserId, batchId: string): Promise<ImportBatchReview>;
  listBatchHistory(ownerId: UserId, options: HistoryOptions): Promise<ImportBatchHistoryItem[]>;
  updateTransactionReviews(ownerId: UserId, updates: ReviewUpdate[]): Promise<ReviewUpdateResult>;
  markBatchReviewComplete(ownerId: UserId, batchId: string): Promise<ImportBatch>;
}

export interface RuleRepository {
  listRules(ownerId: UserId): Promise<CategorizationRule[]>;
  createRule(ownerId: UserId, draft: CategorizationRuleDraft): Promise<CategorizationRule>;
  updateRule(ownerId: UserId, ruleId: string, changes: RuleChanges): Promise<CategorizationRule>;
  deleteRule(ownerId: UserId, ruleId: string): Promise<void>;
}

export interface SummaryRepository {
  loadDashboardSummary(ownerId: UserId, month: StatementMonth | null): Promise<DashboardSummary>;
  refreshMonthlySummary(ownerId: UserId, month: StatementMonth): Promise<MonthlySummary>;
}
```

### Supabase Adapter

The concrete adapter implements those ports and owns all SDK details.

```ts
// src/lib/infrastructure/supabase/finance-repository.ts
export class SupabaseFinanceRepository
  implements BudgetRepository, ImportRepository, RuleRepository, SummaryRepository
{
  constructor(private readonly client: SupabaseClient<Database>) {}

  async findExistingBatch(ownerId: UserId, bank: BankCode, month: StatementMonth) {
    const { data, error } = await this.client
      .from("statement_import_batches")
      .select("*")
      .eq("user_id", ownerId.value)
      .eq("bank", bank)
      .eq("statement_month", month.toPersistence())
      .maybeSingle();

    handlePostgrest(error, "Import batch was not found");
    return data ? batchFromRow(data) : null;
  }
}
```

```ts
// src/lib/infrastructure/supabase/auth-adapter.ts
export class SupabaseAuthSessionPort implements AuthSessionPort {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async currentUser(): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) return null;

    return {
      id: UserId.fromString(data.user.id),
      email: data.user.email ?? null,
    };
  }
}
```

The API and Astro pages should receive `AuthenticatedUser`, repositories, and domain return objects. They should never accept or pass `SupabaseClient<Database>`.

## Step 5 - Proof of Isolation and Before/After

### Swap Impact After Refactor

If Supabase is replaced after this refactor, only these files should change:

- `src/lib/infrastructure/supabase/client.ts`
- `src/lib/infrastructure/supabase/auth-adapter.ts`
- `src/lib/infrastructure/supabase/finance-repository.ts`
- `src/lib/infrastructure/supabase/mappers.ts`
- `src/lib/infrastructure/supabase/errors.ts`
- Composition/bootstrap files that instantiate the port implementations.

These files should not change for a persistence-provider swap:

- `src/components/**`
- `src/pages/api/**`, except dependency composition if colocated there during migration.
- `src/pages/*.astro`
- `src/lib/domain/**`
- `src/lib/imports/revolutCsv.ts`
- `src/lib/imports/ingCsv.ts`
- `supabase/migrations/**`, unless the database provider itself is intentionally migrated.

### Before/After - Domain Types

Before:

- `src/lib/imports/data.ts:16` exports `ImportBatch = Tables<"statement_import_batches">`.
- `src/lib/imports/data.ts:17` exports `ImportedTransaction = Tables<"transactions">`.
- `src/lib/rules/data.ts:9` exports `CategorizationRule = Tables<"categorization_rules">`.

After:

- `ImportBatch`, `ImportedTransaction`, and `CategorizationRule` live in `src/lib/domain/finance/models.ts`.
- Supabase row aliases are private to `src/lib/infrastructure/supabase/mappers.ts`.
- UI receives `ImportBatchReview` with `StatementMonth`, formatted bank labels, and transaction fields already normalized to domain names; it does not receive raw generated rows.

### Before/After - Supabase Client in Signatures

Before:

- `src/lib/imports/data.ts:299` takes `supabase: ImportClient`.
- `src/lib/budget/data.ts:26` takes `supabase: BudgetClient`.
- `src/pages/api/imports/preview.ts:24` passes a Supabase client into import lookup.

After:

- Application services accept `ImportRepository`, `BudgetRepository`, `RuleRepository`, and `SummaryRepository`.
- API handlers call use cases with ports: `previewImport({ auth, imports }, request)`.
- Tests stub narrow repository methods instead of rebuilding `.from().select().eq()` chains.

### Before/After - Auth

Before:

- `src/env.d.ts:3` exposes a Supabase `User` in `App.Locals`.
- `src/middleware.ts:12` calls `supabase.auth.getUser()`.

After:

- `App.Locals.user` is `AuthenticatedUser | null`.
- Middleware calls `authSession.currentUser()` through an auth port.
- Supabase `User` conversion is private to `SupabaseAuthSessionPort`.

### Open Contract Questions

No unresolved question needs to stay in the API layer. The provider-specific decisions below belong in the ACL:

- PostgREST duplicate-key code `23505`, seen today in mappers at `src/lib/budget/data.ts:10` and `src/lib/imports/data.ts:70`, becomes one adapter-level `ConflictError` mapping in `src/lib/infrastructure/supabase/errors.ts`.
- PostgREST no-row code `PGRST116`, currently handled in feature modules such as `src/lib/rules/data.ts:17`, becomes one adapter-level `NotFoundError` mapping.
- Supabase auth user shape, currently exposed at `src/env.d.ts:3`, becomes `AuthenticatedUser` in `src/lib/domain/auth/user-session.ts`.

## Step 6 - Verification and Phase Plan

### Success Criterion

After the refactor, this grep should return only Supabase ACL/adapter files plus package/docs references:

```bash
rg -n '@supabase|SupabaseClient|PostgrestError|createServerClient|@/lib/database.types|Tables<' src tests
```

Allowed result set after the refactor:

- `src/lib/infrastructure/supabase/client.ts`
- `src/lib/infrastructure/supabase/auth-adapter.ts`
- `src/lib/infrastructure/supabase/finance-repository.ts`
- `src/lib/infrastructure/supabase/mappers.ts`
- `src/lib/infrastructure/supabase/errors.ts`
- Focused adapter tests, for example `tests/supabase-finance-repository.test.ts`.

Files that know Supabase today and should no longer know it after the refactor:

- `src/env.d.ts`
- `src/middleware.ts`
- `src/pages/imports.astro`
- `src/pages/dashboard.astro`
- `src/pages/budget.astro`
- `src/pages/api/auth/signup.ts`
- `src/pages/api/auth/signin.ts`
- `src/pages/api/auth/signout.ts`
- `src/lib/budget/http.ts`
- `src/lib/imports/http.ts`
- `src/lib/summary/http.ts`
- `src/lib/budget/data.ts`
- `src/lib/budget/validation.ts`
- `src/lib/imports/data.ts`
- `src/lib/rules/data.ts`
- `src/lib/summary/data.ts`
- `tests/budget-setup.test.ts`
- `tests/import-review.test.ts`
- `tests/monthly-summary-and-rules.test.ts`
- `tests/review-persistence-and-rule-application.test.ts`
- `tests/auth-and-ownership-boundaries.test.ts`

### Phase Plan

1. Create domain models and ports without moving behavior. Add `src/lib/domain/auth/user-session.ts`, `src/lib/domain/finance/models.ts`, and `src/lib/domain/finance/repositories.ts`. Keep old exports temporarily, but stop adding new Supabase row aliases.

2. Add the Supabase ACL adapter. Move `createServerClient`, generated `Database`/`Tables`, PostgREST error mapping, and row/domain mappers into `src/lib/infrastructure/supabase/`. Preserve current behavior exactly, including ownership filtering and replacement semantics.

3. Refactor auth first. Replace `App.Locals.user` Supabase `User` with `AuthenticatedUser`, then route middleware and auth handlers through `AuthSessionPort`. Verify unauthenticated redirect behavior because auth route changes are covered by `AGENTS.md`.

4. Refactor budget/rules/imports/summary services one vertical slice at a time. For each slice, change the feature service signature from `supabase: FeatureClient` to a narrow repository port, then update API/page composition.

5. Replace test Supabase stubs with port-level fakes. Keep a small number of adapter tests that intentionally know Supabase's `.from()` contract; all domain behavior tests should fake repository methods.

6. Run verification. Use the grep above, then run the repository's standard validation commands: `npm run lint`, `npm run check`, and `npm run build`.
