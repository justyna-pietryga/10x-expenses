---
project: "Expenses"
context_type: greenfield
created: 2026-05-18
updated: 2026-05-18
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "Calculating and controlling all expenses against user-defined monthly budget categories across multiple banks."
    - topic: "primary persona scope"
      decision: "Individuals like the user: casual adult people who want control over their finances and conscious savings planning."
    - topic: "auth strategy"
      decision: "Login with an account for the MVP; flat single-user role model unless role separation is identified later."
    - topic: "MVP scope"
      decision: "Scope down to one supported CSV bank format, user-selected supported bank during import, manual/estimated income, user-defined categories and percentage limits, reusable categorization rules from review, and monthly summary."
  frs_drafted: 12
  quality_check_status: accepted
---

## Vision & Problem Statement

Casual adult people who want control over their finances need to review bank account data at the end of every month, calculate all expenses, and divide them into personally defined budget categories. The cost today is manual consolidation across bank accounts and manual category mapping, often in Excel or separate bank tools, before the user can understand whether they stayed within their planned percentages.

The key gap is that bank-provided categories do not match the user's own budget categories, do not consolidate automatically across banks, and do not calculate spending as a percentage of monthly income with carry-over behavior for unused limits. For example, a user may want food to stay under 30% of income and save 5% monthly for travel; if travel money is unused for six months and then spent later, the user does not consider that overspending.

## User & Persona

Primary persona: an individual casual adult who wants conscious control over personal finances and savings. They reach for the product during recurring monthly budget review, especially when they need to understand actual spending against self-defined categories and limits across multiple bank accounts.

## Access Control

Users log in with an account for the MVP. The access model is flat: each account manages its own personal financial data, categories, limits, imported statements, and summaries. No admin/member/guest role separation is planned for the MVP.

## Success Criteria

### Primary

- A logged-in user can import a supported bank statement format, define income or estimated monthly income, define personal categories with percentage limits, review and adjust transaction categories with reusable rules, and see a monthly budget summary showing category usage against income.

### Secondary

- A user can overwrite a previous import for the same bank and month without duplicating expenses.

### Guardrails

- Banking data must remain private and safe because imported statements contain sensitive financial information.
- Imported statement data must be parsed accurately enough that the app does not show wrong transaction amounts, dates, or recipients.
- The MVP uses a supported-banks import model: the user chooses the bank during import, and the app parses only supported statement formats rather than claiming to parse any bank automatically. At least two supported statement formats are preferred for proving the import capability.

## User Stories

### US-01: User imports a supported statement and sees budget usage

- **Given** a logged-in user with configured custom categories, percentage limits, and monthly income or estimated monthly income
- **When** they select a supported bank, upload a supported statement file, review parsed transactions with dates, correct categories, and save reusable categorization rules from those corrections
- **Then** they see a monthly summary showing spending by category as a percentage of income and usage against each category limit

#### Acceptance Criteria

- The import is tied to the selected supported bank, and monthly summaries are calculated from transaction dates parsed from the statement.
- Parsed transactions show enough detail for review: date, title, recipient, amount, and assigned category.
- The user can correct transaction categories before relying on the summary.
- A correction can be saved as a reusable categorization rule.
- The summary uses the user's income or estimated income and configured category percentages.
- Re-importing the same bank/month replaces the previous import batch without duplicating expenses.

## Functional Requirements

- FR-001: User can create an account and log in. Priority: must-have
  > Socrates: Counter-argument considered: "auth adds setup friction before the user sees value." Resolution: revised; account login is crucial because banking data and saved budget history need a protected user account. OAuth is noted as nice-to-have, not required for MVP.
- FR-002: User can import transactions whose month is calculated from parsed transaction dates in the bank statement. Priority: must-have
  > Socrates: Counter-argument considered: "manual month selection may duplicate information already present in the file and could create mismatch." Resolution: revised; manual month selection is dropped if supported statement formats provide parseable transaction dates.
- FR-003: User can choose a supported bank during import. Priority: must-have
  > Socrates: Counter-argument considered: "bank choice is extra work and could be inferred from file structure." Resolution: kept; explicit bank choice keeps the supported-format MVP clear.
- FR-004: User can upload at least two supported bank statement formats. Priority: must-have
  > Socrates: Counter-argument considered: "supporting only one format may be too narrow to prove statement import." Resolution: revised; at least two supported formats should be enough to show the functionality without claiming universal bank parsing.
- FR-005: User can replace a previous import batch for the same bank and month without duplicating expenses. Priority: must-have
  > Socrates: Counter-argument considered: "overwrite logic adds complexity before the first summary works." Resolution: revised; use a simpler replace-batch behavior for the same bank/month instead of transaction-level merge complexity.
- FR-006: User can view parsed transactions with date, title, recipient, and amount. Priority: must-have
  > Socrates: Counter-argument considered: "too much detail may slow review if the main goal is summary." Resolution: kept; transaction detail is required to verify import accuracy.
- FR-007: User can define monthly income or estimated monthly income. Priority: must-have
  > Socrates: Counter-argument considered: "estimated income can make summaries feel less exact." Resolution: kept; estimated income is needed when salary timing does not align with the statement window.
- FR-008: User can define custom budget categories. Priority: must-have
  > Socrates: Counter-argument considered: "category setup upfront delays the first useful result." Resolution: kept; user-defined categories are core because bank categories do not match personal budget plans.
- FR-009: User can set percentage-based limits for categories. Priority: must-have
  > Socrates: Counter-argument considered: "percentage limits could come after basic categorization and totals." Resolution: kept; limits are core to controlling spending against income.
- FR-010: User can review and change a transaction category. Priority: must-have
  > Socrates: Counter-argument considered: "manual review keeps the workflow close to Excel." Resolution: kept; corrections are necessary to make personalized categorization accurate.
- FR-011: User can create a reusable categorization rule from a correction, such as `Lidl` to `Food`. Priority: must-have
  > Socrates: Counter-argument considered: "rule creation may be too much for v1 if corrections alone work." Resolution: kept; reusable rules are the path toward reducing repeated manual work.
- FR-012: User can see a monthly summary of category spending as a percentage of income and limit usage. Priority: must-have
  > Socrates: Counter-argument considered: "the summary depends on many earlier inputs being correct, so it may be fragile in v1." Resolution: kept; the summary is the main proof that the product works.

## Non-Functional Requirements

- Financial data from one user account must never be visible to another user account.
- A user must only be able to access imported statements, transactions, categories, limits, rules, and summaries that belong to their own account.
- For supported statement formats, parsed transaction amounts and dates must not be wrong.
- The product must make it clear when a summary depends on user-reviewed or user-corrected transaction categories.

## Business Logic

The app classifies a user's expenses into personal categories and calculates monthly category limit usage based on parsed bank data, income, and user-defined limits.

The rule consumes imported bank statement transactions, user-defined categories, reusable categorization rules, and monthly income or estimated monthly income. Its output is a categorized transaction set and a monthly budget summary that shows how much of each category limit has been used.

The user encounters the rule after importing a supported statement: the app proposes categories, lets the user correct them, records reusable rules from corrections, and recalculates category usage against income and limits.

## Product Framing

- Product type: web app.
- Target scale: small, for just the user or a handful of users once live.
- Timeline: after-hours work. Preferred target is August 9, 2026, and the hard deadline is September 13, 2026.
- MVP budget: 3 weeks for the scoped-down first version.
- 100x scale note: the business rule stays per-user. Each account has its own categories, rules, income, imports, and summaries. The rule should not learn from or expose other users' financial data.

## Non-Goals

- No mobile application in the MVP; the first version is web-only.
- No family/member synchronization in the MVP; the product is for an individual user.
- No universal "any bank, any format" parser; the MVP supports explicit bank/format combinations only.
- No automatic bank connection or account synchronization; the MVP relies on imported statement files.
- No fully AI-only categorization without user-defined rules; categorization must remain controllable by the user.

## Open Questions

None.
## Quality cross-check

- Access Control: present.
- Business Logic: present.
- Project artifacts: present.
- Timeline-cost ack: present; scoped MVP is recorded as 3 weeks.
- Non-Goals: present.
- Preserved behavior: n/a for greenfield.
