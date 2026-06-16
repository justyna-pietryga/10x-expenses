import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

function getTransactionRow(page: Page, recipient: string) {
  return page.getByRole("row").filter({ hasText: recipient });
}

async function createCategory(request: APIRequestContext, name: string) {
  const response = await request.post("/api/budget/categories", {
    data: {
      carryover_enabled: false,
      name,
      percentage_limit: 10,
    },
  });
  const payload = (await response.json()) as {
    category?: { id: string; name: string };
    error?: string;
  };

  if (!response.ok() || !payload.category) {
    throw new Error(payload.error ?? "Could not create the E2E category");
  }

  return payload.category;
}

async function deleteCategory(request: APIRequestContext, categoryId: string | null) {
  if (!categoryId) {
    return;
  }

  try {
    await request.delete(`/api/budget/categories/${categoryId}`);
  } catch {
    // Ignore cleanup failures so the main assertion stays visible.
  }
}

async function saveManualIncome(request: APIRequestContext, month: string, amount: number) {
  const response = await request.post("/api/budget/income", {
    data: {
      amount,
      is_estimated: false,
      month,
    },
  });
  const payload = (await response.json()) as {
    error?: string;
    income?: { id: string };
  };

  if (!response.ok() || !payload.income) {
    throw new Error(payload.error ?? "Could not save the E2E income row");
  }
}

async function commitImportBatch(
  request: APIRequestContext,
  payload: {
    bank: "ing" | "revolut";
    period_end: string;
    period_start: string;
    source_filename: string;
    statement_month: string;
    transactions: {
      amount: number;
      recipient: string;
      title: string;
      transaction_date: string;
    }[];
  },
) {
  const response = await request.post("/api/imports/commit", {
    data: {
      ...payload,
      confirm_replace: true,
    },
  });
  const body = (await response.json()) as {
    batch?: { id: string };
    error?: string;
  };

  if (!response.ok() || !body.batch) {
    throw new Error(body.error ?? "Could not commit the E2E import batch");
  }

  return body.batch;
}

// risk: sign-derived imported income stays reviewable without a category and increases dashboard income only after review
// seed: tests/e2e/seed.spec.ts
test.describe("cashflow type separation", () => {
  test("reviewed imported income feeds the income basis without entering expense category usage [risk #0]", async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);

    const timestamp = Date.now();
    const uniqueYear = 5000 + Math.floor(Math.random() * 3000);
    const monthPrefix = `${uniqueYear}-02`;
    const statementMonth = `${monthPrefix}-01`;
    const dashboardMonth = `${uniqueYear}-02`;
    const expenseRecipient = `E2E Cashflow Expense ${timestamp}`;
    const incomeRecipient = `E2E Cashflow Income ${timestamp}`;
    const categoryName = `E2E Cashflow Category ${timestamp}`;
    let categoryId: string | null = null;

    try {
      categoryId = (await createCategory(request, categoryName)).id;
      await saveManualIncome(request, dashboardMonth, 0);

      const batch = await commitImportBatch(request, {
        bank: "ing",
        period_end: `${monthPrefix}-28`,
        period_start: `${monthPrefix}-01`,
        source_filename: `cashflow-type-separation-${timestamp}.csv`,
        statement_month: statementMonth,
        transactions: [
          {
            amount: -120,
            recipient: expenseRecipient,
            title: "Groceries",
            transaction_date: `${monthPrefix}-05`,
          },
          {
            amount: 2500,
            recipient: incomeRecipient,
            title: "Salary",
            transaction_date: `${monthPrefix}-06`,
          },
        ],
      });

      await page.goto(`/imports?batch=${batch.id}`);
      await expect(page.getByRole("heading", { name: "This batch still needs review confirmation." })).toBeVisible();

      const expenseRow = getTransactionRow(page, expenseRecipient);
      const incomeRow = getTransactionRow(page, incomeRecipient);

      await expect(expenseRow.getByRole("combobox")).toHaveCount(1);
      await expect(incomeRow.getByRole("combobox")).toHaveCount(0);
      await expect(incomeRow).toContainText("Income");
      await expect(incomeRow).toContainText("Reviewed imported income feeds the dashboard income basis automatically.");
      await expect(incomeRow).toContainText("No categorization rule for income rows.");

      await expenseRow.getByRole("combobox").selectOption(categoryId);
      await expect(page.getByText("1 unsaved change")).toBeVisible();

      const saveReviewResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/imports/transactions/bulk") && response.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Save all changes" }).click();
      await saveReviewResponse;
      await expect(page.getByText("Review changes saved.").first()).toBeVisible();
      await expect(page.getByText("1 unsaved change")).toHaveCount(0);

      const completeReviewResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/imports/batches/${batch.id}/complete`) &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Mark review complete" }).click();
      await completeReviewResponse;
      await expect(page.getByText("Review marked complete.")).toBeVisible();

      await page.goto(`/dashboard?month=${dashboardMonth}`);
      await expect(page.getByText("Income basis", { exact: true })).toBeVisible();
      await expect(page.getByText("Imported expense spend", { exact: true })).toBeVisible();
      await expect(page.getByRole("article").filter({ hasText: "Income basis" })).toContainText("2500.00 PLN");
      await expect(page.getByRole("article").filter({ hasText: "Imported expense spend" })).toContainText("120.00 PLN");

      const categoryRow = page.getByRole("row").filter({ hasText: categoryName });
      await expect(categoryRow).toContainText("120.00 PLN");
      await expect(page.getByText(/Reviewed uncategorized expense spend:/i)).toBeVisible();
    } finally {
      await deleteCategory(request, categoryId);
    }
  });
});
