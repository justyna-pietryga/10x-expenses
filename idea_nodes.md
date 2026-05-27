## Expenses – MVP

### Main Problem

Calculating expenses, managing a monthly budget, and setting custom limits for specific types of spending can be time‑consuming—especially when you have multiple bank accounts. Some banks, such as Revolut or ING, offer their own expense‑categorization tools, but creating a unified budget requires consolidating all of this data. On top of that, users often have their own categories that don’t align with automatic ones. Manually rewriting expenses at the end of the month is tedious, as is assigning each transaction to individually defined categories. Even when done in Excel, the process is discouraging and requires significant effort.

### Minimum Viable Feature Set

- Merging expenses based on statements from different banks
- Automatic categorization using (ideally) AI when no clear match is found, combined with user‑defined rules. For example: “If the word ‘Żabka’ appears, assign the category ‘Treats’.”
- Ability to categorize BLIK transactions
- Summary of expenses and the percentage of each budget category used, based on income—which, ideally, would also be automatically detected from transfers
- Users can set percentage‑based limits for each spending category

## Out of Scope for the MVP

- Mobile applications (initially web‑only)
- Synchronization between multiple family members; the user is individual‑only

## Success Criteria

- Based on bank statements, the user receives a complete overview of expenses with assigned categories and their percentage share of the budget
- After editing categories for about three months, in 80% of cases the user no longer needs to make manual adjustments to achieve satisfying results
