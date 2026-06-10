# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (Section 1-Section 5); cookbook patterns at the bottom (Section 6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see Section 8).
>
> Last updated: 2026-06-10

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost x signal.** The cheapest test that gives a real signal for the risk wins. Do not promote to e2e because e2e "feels safer." Do not put a vision model on top of a deterministic visual diff that already catches the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team is worried about X, and the failure would surface somewhere in <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents what could fail and why we believe it's likely, drawn from documents, interview, and codebase signal. It does NOT claim to know which line owns the failure. That knowledge is produced by `/10x-research` during each rollout phase. If the plan and research disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src`, `supabase`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by risk = impact x likelihood. Risks are failure scenarios in user/business terms, not test names. The Source column cites the evidence that surfaced this risk, never a specific file as where the failure lives.

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence - not anchor) |
|---|---|---|---|---|
| 1 | The app shows a monthly summary that looks trustworthy but is materially wrong because parsed or categorized transaction data drifted underneath it. | High | High | PRD lines 20-23, 30-33, 40-42, 90-94; roadmap lines 20-22, 95-105; interview Q1, Q4 |
| 2 | Re-importing the same bank/month leaves the month in a corrupted intermediate state, such as duplicated rows, missing old rows, or a partial replacement instead of one clean batch. | High | High | PRD lines 36-37, 59, 71-72; roadmap lines 83-93; interview Q1 |
| 3 | Bulk review says category changes were applied, but some edits never persist or only partially persist. | High | High | roadmap lines 121-131; interview Q3, Q4; hot-spot dir `src/pages/api` (21 touches/30d); hot-spot dir `src/lib/imports` (18 touches/30d); hot-spot dir `src/components/imports` (14 touches/30d) |
| 4 | Rule or category updates make the review table look correct while mutating the wrong underlying transactions. | High | Medium | PRD lines 49-58, 81-85; roadmap lines 133-143; interview Q4; hot-spot dir `src/components/imports` (14 touches/30d); hot-spot dir `src/pages/api` (21 touches/30d) |
| 5 | A user can access or affect finance data that does not belong to their account because auth or ownership checks are incomplete on finance flows. | High | Medium | PRD lines 40, 90-91, 103-105; roadmap lines 47-52; tech-stack lines 15-19; AGENTS lines 31-34; hot-spot dir `src/pages/api` (21 touches/30d); hot-spot dir `src/components/auth` (6 touches/30d) |
| 6 | Invalid or unexpected import or rule input is accepted server-side, leading to silent bad state instead of a rejected request. | Medium | Medium | PRD lines 41, 92-94; CLAUDE lines 38-39; interview Q1; hot-spot dir `src/lib/imports` (18 touches/30d); hot-spot dir `src/pages/api` (21 touches/30d) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | A summary reflects persisted reviewed data correctly, and incomplete or invalid review state cannot masquerade as a clean monthly result. | Reasonable-looking totals mean the summary is correct. | Summary input contract, reviewed or unreviewed state rules, persistence boundary | integration | copied production calculation |
| #2 | Re-importing the same bank/month results in one correct batch with no duplicates, missing rows, or orphaned prior state even when replacement fails mid-flight. | Replace behavior is effectively the same as append-then-cleanup. | Batch identity rules, overwrite semantics, persisted side effects, and failure behavior during replacement | integration | happy-path-only import check |
| #3 | Bulk save either persists every intended change or returns a failure that leaves the user with truthful state. | Success UI means persistence succeeded for all rows. | Request and response contract, partial-failure behavior, save lifecycle | integration | UI-only assertion with mocked internals |
| #4 | Rule or category application changes exactly the intended transactions and leaves non-matching rows untouched. | Visible table state is a reliable oracle for underlying mutations. | Match criteria, mutation scope, current-batch behavior | integration | asserting against transformed UI text only |
| #5 | Authenticated users can only read or mutate their own finance data across import, budget, rules, and summary flows. | Logged in is equivalent to authorized for this record. | Ownership model, session shape, per-endpoint access rules | integration | over-mocking auth or session boundaries |
| #6 | Bad import or rule input is rejected server-side with no persisted corruption. | Client validation already guarantees safe input. | Server validation boundary, error mapping, persistence behavior on invalid input | integration | implementation-mirror validator tests |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via `/10x-new`. Status moves left-to-right through the values below; the orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical import and summary integrity | Defend the core data-integrity path for import replacement, summary gating, and summary correctness. | #1, #2, #6 | integration | implemented | testing-critical-import-and-summary-integrity |
| 2 | Review persistence and rule application | Catch review-flow regressions where UI state drifts from persisted state or mutates the wrong rows. | #3, #4 | integration | implemented | testing-review-persistence-and-rule-application |
| 3 | Auth and ownership boundaries | Prove finance flows enforce ownership, not just authentication. | #5 | integration | implemented | testing-auth-and-ownership-boundaries |
| 4 | Quality gates and cookbook wiring | Lock the floor with stable suite commands, rollout patterns, and required gates. | cross-cutting | gates | implemented | testing-quality-gates-and-cookbook-wiring |

## 4. Stack

The classic test base for this project. AI-native tools, if any, carry a `checked:` date so future readers can see which lines need re-verification. Recommendations in this section are grounded in local manifests/configs plus the tools actually exposed in this session.

| Layer | Tool | Version | Notes |
|------|------|---------|-------|
| unit + integration | Vitest | ^3.2.4 | Configured today, but the suite is sparse and clustered in root `tests/`. |
| API mocking | none yet | n/a | Prefer using the real app boundary in Phase 1 unless research proves edge mocking is cheaper. |
| e2e | none yet | n/a | Use `/10x-e2e` only for risks that genuinely need browser coverage. |
| accessibility | none yet | n/a | No dedicated a11y layer is configured today. |
| AI-native | Browser tool - checked: 2026-06-02 | n/a | Possible verification layer; do not use when deterministic assertions already catch the regression. |

**Stack grounding tools (current session):**
- Docs: none - no docs MCP surfaced in this session; checked: 2026-06-02
- Search: none - no search MCP surfaced in this session; checked: 2026-06-02
- Runtime/browser: browser tool - available as a possible verification layer, not used in discovery; checked: 2026-06-02
- Provider/platform: none - no dedicated GitHub, Cloudflare, or Supabase MCP surfaced; checked: 2026-06-02

## 5. Quality Gates

The full set of gates that must pass before a change reaches production. "Required for Section 3 Phase <N>" means the gate is enforced once that rollout phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck + build | local + CI | required | syntactic, type, and build drift |
| unit + integration | local + CI | required | import, summary, and API logic regressions |
| auth or ownership integration checks | local + CI | required after Section 3 Phase 3 | cross-user access or mutation regressions |
| e2e on critical flows | CI on PR | optional | broken browser-level paths that integration cannot expose cheaply |
| post-edit hook | local (agent loop) | optional convenience | regressions at edit time before the next explicit gate |
| pre-prod smoke | between merge + prod | optional | environment-specific failures |

### 5.1 Canonical command ownership

- Repo-owned gate commands are `npm run lint`, `npm run typecheck`, `npm run check`, `npm test`, and `npm run build`.
- CI enforces the required pull-request floor in fail-fast order: `npm run lint`, `npm test`, `npm run check`, then `npm run build`.
- Local phase work may still run targeted suite commands such as `npm test -- tests/import-review.test.ts`, but the merge gate is the repo-wide `npm test`.
- Husky pre-commit stays intentionally narrow at `npx lint-staged`; it is a fast staged-file guard, not a substitute for the full repo gates.
- User-local Codex `PostToolUse` hooks remain optional accelerators. The current pattern is `npx eslint --fix . --quiet` plus `npx tsc --noEmit`, but the repo does not require or enforce a home-directory hook setup.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the relevant rollout phase ships; before that, the sub-section reads "TBD - see Section 3 Phase <N>."

### 6.1 Adding an integration test for import or summary behavior

- Extend the existing finance-domain root suites before creating a new harness: use `tests/import-review.test.ts` for import contracts and `tests/monthly-summary-and-rules.test.ts` for summary contracts.
- Stay at the current cheapest useful seam: direct helper calls for data behavior such as `commitImportBatch` or `loadDashboardSummary`, plus direct Astro route invocation when the risk is request or response truthfulness.
- Keep assertions on business outcomes, not query choreography. Phase 1 patterns now cover preserved month state on replacement failure, default month selection on the freshest import, pending-only months that remain untrusted, and cached summary snapshots that refresh from live tables.
- Reuse the hand-built Supabase stub style already in those suites. Do not introduce browser coverage or generic mocks when the helper or route seam already exposes the regression clearly.

### 6.2 Adding an integration test for review persistence

- Extend `tests/review-persistence-and-rule-application.test.ts` for Phase 2 finance-domain coverage instead of growing the Phase 1 suites. This suite owns truthful bulk-save behavior, review-completion boundary checks, and dashboard-rule downstream mutation-scope coverage.
- Keep the oracle at the persistence boundary: assert which rows really changed, which rows stayed untouched, and whether the route payload told the truth about both. Do not stop at response-shape assertions when the risk is saved-state drift.
- Treat bulk category save and rule creation as separate contracts. Bulk save may return mixed `updated` and `failed` rows; row-level or dashboard rule flows then influence future imports, but they do not redefine the bulk-save truthfulness contract.
- For rule mutation-scope work, prove both positive and negative cases across `recipient`, `title`, and `both` matching. The goal is not "a rule matched once"; it is "only the intended future imported rows changed category."
- Prefer helper-plus-route integration over browser coverage here. The existing Playwright smoke already covers the user-visible dirty-state slice of risk `#3`; Phase 2 integration work should stay below that layer unless a future risk genuinely needs the browser.

### 6.3 Adding an integration test for auth or ownership checks

- Extend `tests/auth-and-ownership-boundaries.test.ts` for finance ownership work instead of spreading cross-user cases into older budget, import, or summary suites. That dedicated suite owns the multi-user fixture builders and the ownership seam.
- Stay at the current cheapest useful layer: direct domain-helper assertions for read and mutation isolation, plus direct Astro route invocation when the risk is the user-visible HTTP contract.
- Model three distinct outcomes in the harness even though the runtime cannot surface all three separately today: owned record, foreign-owned record, and genuinely missing record. This keeps the fixture intent explicit while the app still exposes the truthful hidden-denial contract.
- Under the current anon-key plus RLS architecture, foreign-owned finance rows are invisible to the server client. Assert `401` for unauthenticated requests, and assert existing `404` or row-failure behavior for foreign-owned or missing records unless the architecture changes to make a true authorization distinction observable.
- Keep assertions on business outcomes, not query choreography. For budget and rules, prove only owned rows can be listed or mutated. For imports, prove both batch-level and row-level boundaries. For summary, prove visible outputs like available months, totals, category rows, and warning batches are derived only from the authenticated user's data.

### 6.4 Adding a test for a new API endpoint

- Treat API routes as thin integration boundaries. Build a real `Request`, call the exported Astro handler directly, and assert the structured JSON payload plus status code the user would actually receive.
- Prefer endpoint tests for boundary failures and contract truthfulness: wrong content type, malformed payload shape, invalid query values, or helper failures that must surface as stable JSON errors.
- If the endpoint mostly forwards to a domain helper, pair one helper-level test for the stateful business behavior with one route-level test for the HTTP contract instead of duplicating the same assertion at multiple layers.
- Phase 3 will add ownership-specific endpoint guidance. Until then, follow the Phase 1 route pattern for import and summary boundaries.

### 6.5 Per-rollout-phase notes

- Phase 1 shipped with two reusable boundaries: finance-domain coverage belongs in the existing root suites, and the preferred layer is helper plus route integration rather than browser automation.
- The oracle for import and summary work is user-truthful persisted state: one clean bank-month batch after replace attempts, and summary totals that never treat pending review data as trusted spend.
- Phase 1 stayed intentionally bounded to import replacement integrity, summary trust edges, and invalid request rejection.
- Phase 2 shipped in a dedicated suite, `tests/review-persistence-and-rule-application.test.ts`, because the review and rule risks needed their own fixture builders and would have made the Phase 1 suites harder to reason about.
- The oracle for Phase 2 is "persisted rows plus truthful payload": mixed bulk saves are acceptable only when successful rows really persist, failed rows remain untouched, and the UI reconciliation keeps those two states visible to the user.
- Rule coverage in Phase 2 is lifecycle-aware: dashboard rule create, update, and delete behavior must be proven through to future import categorization outcomes, including untouched non-matching rows.
- Phase 3 shipped in `tests/auth-and-ownership-boundaries.test.ts` as a dedicated ownership suite so cross-user risks stay auditable instead of leaking into older finance-domain regressions.
- The oracle for Phase 3 is ownership isolation, not theoretical status-code purity: with the current server client and RLS shape, foreign-owned rows stay hidden and therefore share the same not-found or row-failure contract as genuinely missing rows.
- Phase 3 coverage spans the full finance surface: budget reads and writes, import batch and transaction boundaries, rule list and mutation boundaries, and dashboard summary outputs that must ignore another user's records entirely.
- Phase 4 shipped as repo wiring rather than a new test harness: `package.json` owns the canonical gate commands, CI enforces the required floor with repo-wide `npm test`, and the cookbook now documents pre-commit and optional local hook boundaries explicitly.
- The oracle for Phase 4 is contract alignment across three places: repo scripts, CI workflow order, and this cookbook. If those three drift, the quality gate is incomplete even if individual commands still pass.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout. Future contributors should respect these unless the underlying assumption changes.

- **Generated types and thin wrappers** - tests here mostly mirror implementation instead of catching business regressions. Re-evaluate if these layers gain meaningful logic. (Source: Phase 2 interview Q5.)
- **Broad snapshot coverage** - high churn and weak signal for the finance risks that matter in this product. Re-evaluate if a stable visual diff target appears. (Source: Phase 2 interview Q5.)
- **External services like Supabase itself** - the rollout should test our contracts and ownership rules, not Supabase internals. Re-evaluate if we add custom platform glue that changes behavior materially. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (Section 1-Section 5) last reviewed: 2026-06-10
- Stack versions last verified: 2026-06-02
- AI-native tool references last verified: 2026-06-02

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- Section 7 negative-space no longer matches what the team believes.
