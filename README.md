# Expenses

Expenses is a personal finance web app for importing monthly bank statements, mapping transactions into your own budget categories, and reviewing spending against percentage-based limits.

The product is built for a single user account. Each user signs in, defines monthly income and category limits, imports supported bank CSV files, reviews categorization, saves reusable rules, and then checks a monthly dashboard that shows spending by category, imported income, excluded rows, and review warnings.

## What the App Does

- Authenticates users with Supabase Auth.
- Stores monthly income or estimated income for each month.
- Lets users define custom budget categories with percentage caps.
- Imports supported bank statement CSV files into monthly batches.
- Replaces a previous import for the same bank and month after explicit confirmation.
- Lets users review imported transactions before they count as trusted dashboard data.
- Saves reusable categorization rules, for example matching `Lidl` to `Food`.
- Builds a monthly dashboard showing spend vs. income and category usage vs. limits.

## Main User Flow

The app is organized around this core flow:

1. `Auth`
   Create an account or sign in at `/auth/signup` and `/auth/signin`.
2. `Budget setup`
   Open `/budget`, set monthly income, and create active budget categories whose limit total stays within 100%.
3. `Import`
   Open `/imports`, choose a supported bank, upload a CSV statement, preview the parsed rows, and confirm replacement if the same bank-month batch already exists.
4. `Review`
   Check imported transactions, adjust categories, include or exclude rows, and optionally create reusable rules. The batch remains pending until review is completed.
5. `Dashboard`
   Open `/dashboard` to see monthly totals, category usage, incomplete review warnings, excluded transactions, and rule management.

## Supported Bank Formats

The current import surface is intentionally narrow and explicit. The app supports:

- `Revolut CSV`
- `ING CSV`

Current import behavior:

- Only `.csv` uploads are accepted.
- The user must choose the bank before previewing the file.
- `Revolut` and `ING` are the only accepted bank values in the API.
- Cashflow type is inferred from the amount sign by default:
  negative values become `expense`, zero or positive values become `income`.
- Re-importing the same `(user, bank, statement month)` replaces the previous batch instead of duplicating rows.

## Tech Stack

- `Astro` for server-rendered pages
- `React` for interactive islands
- `TypeScript`
- `Tailwind CSS`
- `Supabase` for auth and Postgres
- `Cloudflare` adapter and Wrangler-based deployment
- `Vitest` for integration tests
- `Playwright` for E2E coverage

## Local Development

### Prerequisites

- `Node.js` 22
- `npm`
- `Docker`
- `Supabase CLI`

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create local env files from the example:

```bash
cp .env.example .env
cp .env.example .dev.vars
```

Both files need:

```bash
SUPABASE_URL=...
SUPABASE_KEY=...
```

### 3. Start local Supabase

If this is your first local run:

```bash
npx supabase start
```

This project keeps local Supabase config in [`supabase/config.toml`](/C:/Users/justy/10xdevs/supabase/config.toml:1). The local defaults are:

- API: `http://127.0.0.1:54321`
- DB: `54322`
- Studio: `http://127.0.0.1:54323`
- Inbucket: `http://127.0.0.1:54324`

Use the local anon key printed by `supabase start` together with:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<local anon key>
```

### 4. Apply migrations

The dev script pushes the local schema before starting Astro:

```bash
npm run dev
```

Equivalent schema command:

```bash
supabase db push --local
```

### 5. Run the app

```bash
npm run dev
```

Then open `http://localhost:4321`.

### Local auth note

Local Supabase config already disables email confirmation in [`supabase/config.toml`](/C:/Users/justy/10xdevs/supabase/config.toml:112), so local sign-up can be used immediately without inbox confirmation.

### Stop local Supabase

```bash
npx supabase stop
```

## Project Routes

- `/` - landing page
- `/auth/signin` - sign in
- `/auth/signup` - sign up
- `/budget` - monthly income and category setup
- `/imports` - statement upload, history, and review
- `/dashboard` - monthly summary and rules

Protected routes are enforced in [`src/middleware.ts`](/C:/Users/justy/10xdevs/src/middleware.ts:1).

## Test and Validation Commands

Use these repo commands during development:

```bash
npm run lint
npm run typecheck
npm run check
npm test
npm run build
```

E2E commands:

```bash
npm run test:e2e:install
npm run test:e2e
npm run test:e2e:headed
```

The repository-specific handoff gate is:

```bash
npm run lint
npm run check
npm run build
```

## Repository Structure

```text
src/
  components/        UI and interactive islands
  layouts/           Astro layouts
  lib/               finance, auth, summary, and import logic
  pages/             routes and API handlers
supabase/
  migrations/        local schema history
tests/
  *.test.ts          Vitest integration coverage
  e2e/               Playwright browser tests
context/
  foundation/        PRD, stack, infra, and test-plan docs
```

## Deployment

The project is currently shaped for `Cloudflare Workers + Pages` with Wrangler. Build with:

```bash
npm run build
```

Deploy with:

```bash
npx wrangler deploy
```
