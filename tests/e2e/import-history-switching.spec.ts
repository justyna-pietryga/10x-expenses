import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHistoryButton(page: Page, sourceFilename: string) {
  return page.getByRole("button", {
    name: new RegExp(escapeForRegExp(sourceFilename), "i"),
  });
}

async function getFirstCategorySelect(page: Page): Promise<Locator> {
  const categorySelects = page.getByRole("combobox");
  expect(await categorySelects.count()).toBeGreaterThan(0);

  return categorySelects.nth(0);
}

async function createCategory(request: APIRequestContext, categoryName: string) {
  const response = await request.post("/api/budget/categories", {
    data: {
      carryover_enabled: false,
      name: categoryName,
      percentage_limit: 0,
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
    // Ignore cleanup failures so the main assertion still wins.
  }
}

async function commitImportBatch(
  request: APIRequestContext,
  payload: {
    bank: "ing" | "revolut";
    period_end: string;
    period_start: string;
    sourceFilename: string;
    statement_month: string;
    transactions: {
      amount: number;
      recipient: string;
      title: string;
      transaction_date: string;
    }[];
  },
) {
  const commitResponse = await request.post("/api/imports/commit", {
    data: {
      bank: payload.bank,
      confirm_replace: true,
      period_end: payload.period_end,
      period_start: payload.period_start,
      source_filename: payload.sourceFilename,
      statement_month: payload.statement_month,
      transactions: payload.transactions,
    },
  });
  const commitPayload = (await commitResponse.json()) as {
    batch?: {
      id: string;
      source_filename: string | null;
    };
    error?: string;
  };

  if (!commitResponse.ok() || !commitPayload.batch) {
    throw new Error(commitPayload.error ?? "Could not commit the E2E import");
  }

  return {
    id: commitPayload.batch.id,
    sourceFilename: commitPayload.batch.source_filename ?? payload.sourceFilename,
  };
}

// risk: test-plan.md #3 - import history switching keeps persisted review state truthful
// seed: tests/e2e/seed.spec.ts
test.describe("risk #3 - import history switching preserves review changes", () => {
  test("save-and-switch keeps review edits, and completed history stays reopenable", async ({ page, request }) => {
    test.setTimeout(90_000);

    const timestamp = Date.now();
    const uniqueYear = 6000 + Math.floor(Math.random() * 3000);
    const revolutMonthPrefix = `${uniqueYear}-05`;
    const ingMonthPrefix = `${uniqueYear}-06`;
    const categoryName = `E2E Import History ${timestamp}`;
    const revolutFilename = `revolut-history-${timestamp}.csv`;
    const ingFilename = `ing-history-${timestamp}.csv`;
    const revolutRecipient = `E2E History Revolut ${timestamp}`;
    const ingRecipient = `E2E History ING ${timestamp}`;
    let categoryId: string | null = null;

    try {
      const category = await createCategory(request, categoryName);
      categoryId = category.id;

      // Set up two owned batches through the authenticated API flow so the test can switch between them.
      await page.goto("/imports");
      await expect(page.getByRole("heading", { name: /import and review your bank statement/i })).toBeVisible();

      const revolutBatch = await commitImportBatch(request, {
        bank: "revolut",
        period_end: `${revolutMonthPrefix}-31`,
        period_start: `${revolutMonthPrefix}-01`,
        sourceFilename: revolutFilename,
        statement_month: `${revolutMonthPrefix}-01`,
        transactions: [
          {
            amount: -40,
            recipient: revolutRecipient,
            title: "Revolut groceries",
            transaction_date: `${revolutMonthPrefix}-05`,
          },
        ],
      });
      const ingBatch = await commitImportBatch(request, {
        bank: "ing",
        period_end: `${ingMonthPrefix}-30`,
        period_start: `${ingMonthPrefix}-01`,
        sourceFilename: ingFilename,
        statement_month: `${ingMonthPrefix}-01`,
        transactions: [
          {
            amount: -55,
            recipient: ingRecipient,
            title: "ING groceries",
            transaction_date: `${ingMonthPrefix}-06`,
          },
        ],
      });

      // Open the seeded ING batch directly so the switch flow is isolated from older history rows.
      await page.goto(`/imports?batch=${ingBatch.id}`);
      const revolutHistoryButton = getHistoryButton(page, revolutBatch.sourceFilename);
      const ingHistoryButton = getHistoryButton(page, ingBatch.sourceFilename);
      await expect(ingHistoryButton).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { name: "This batch still needs review confirmation." })).toBeVisible();

      // Draft a category change on the active batch so switching has something real to protect.
      const activeCategorySelect = await getFirstCategorySelect(page);
      await activeCategorySelect.selectOption(categoryId);
      await expect(activeCategorySelect).toHaveValue(categoryId);
      await expect(page.getByText("1 unsaved change")).toBeVisible();

      // Try switching away and confirm Stay keeps both the active batch and the local draft intact.
      await revolutHistoryButton.click();
      await expect(
        page.getByRole("heading", { name: "Switch batches without losing your current edits?" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Stay" }).click();
      await expect(
        page.getByRole("heading", { name: "Switch batches without losing your current edits?" }),
      ).toHaveCount(0);
      await expect(page.getByText("1 unsaved change")).toBeVisible();
      await expect(ingHistoryButton).toHaveAttribute("aria-current", "page");

      // Save the draft through the switch dialog and wait for the destination batch to load.
      await revolutHistoryButton.click();
      const saveBeforeSwitchResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/imports/transactions/bulk") && response.request().method() === "PATCH",
      );
      const switchToRevolutResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/imports/batches/${revolutBatch.id}`) && response.request().method() === "GET",
      );
      await page.getByRole("button", { name: "Save and switch" }).click();
      await saveBeforeSwitchResponse;
      await switchToRevolutResponse;
      await expect(page).toHaveURL(new RegExp(`[?&]batch=${revolutBatch.id}(?:$|&)`));
      await expect(revolutHistoryButton).toHaveAttribute("aria-current", "page");

      // Return to the original batch and confirm the saved category persisted across the round-trip.
      const switchBackToIngResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/imports/batches/${ingBatch.id}`) && response.request().method() === "GET",
      );
      await ingHistoryButton.click();
      await switchBackToIngResponse;
      await expect(page).toHaveURL(new RegExp(`[?&]batch=${ingBatch.id}(?:$|&)`));
      const persistedCategorySelect = await getFirstCategorySelect(page);
      await expect(persistedCategorySelect).toHaveValue(categoryId);

      // Complete the batch so the test can reopen it later as completed history.
      const completeBatchResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/imports/batches/${ingBatch.id}/complete`) &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Mark review complete" }).click();
      await completeBatchResponse;
      await expect(page.getByText("Review marked complete.")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "This batch was already confirmed and stays open for corrections." }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Mark review complete" })).toHaveCount(0);

      // Reopen the completed batch from history after visiting another batch, then confirm it is still editable.
      const switchAwayFromCompletedResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/imports/batches/${revolutBatch.id}`) && response.request().method() === "GET",
      );
      await revolutHistoryButton.click();
      await switchAwayFromCompletedResponse;
      await expect(revolutHistoryButton).toHaveAttribute("aria-current", "page");

      const reopenCompletedBatchResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/imports/batches/${ingBatch.id}`) && response.request().method() === "GET",
      );
      await ingHistoryButton.click();
      await reopenCompletedBatchResponse;
      await expect(
        page.getByRole("heading", { name: "This batch was already confirmed and stays open for corrections." }),
      ).toBeVisible();

      const completedBatchCategorySelect = await getFirstCategorySelect(page);
      await completedBatchCategorySelect.selectOption("");
      await expect(page.getByText("1 unsaved change")).toBeVisible();
      const saveCompletedCorrectionResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/imports/transactions/bulk") && response.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Save all changes" }).click();
      await saveCompletedCorrectionResponse;
      await expect(page.getByText("Review changes saved.")).toBeVisible();
      await expect(completedBatchCategorySelect).toHaveValue("");
      await expect(page.getByText("1 unsaved change")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "This batch was already confirmed and stays open for corrections." }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Mark review complete" })).toHaveCount(0);
    } finally {
      await deleteCategory(request, categoryId);
    }
  });
});
