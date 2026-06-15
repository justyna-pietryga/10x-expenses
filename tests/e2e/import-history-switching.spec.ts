import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const ingCsvContent = readFileSync(
  path.resolve(process.cwd(), "context/foundation/resources/ing-statement-example.csv"),
  "utf8",
);
const revolutCsvContent = readFileSync(
  path.resolve(process.cwd(), "context/foundation/resources/revolut-statement-example.csv"),
  "utf8",
);

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

async function commitImportBatchFromPage(
  page: Page,
  options: {
    bank: "ing" | "revolut";
    csvContent: string;
    sourceFilename: string;
  },
) {
  return page.evaluate(async ({ bank, csvContent, sourceFilename }) => {
    const formData = new FormData();
    formData.set("bank", bank);
    formData.set("file", new File([csvContent], sourceFilename, { type: "text/csv" }));

    const previewResponse = await fetch("/api/imports/preview", {
      method: "POST",
      body: formData,
    });
    const previewPayload = (await previewResponse.json()) as {
      bank: "ing" | "revolut";
      existing_batch: { id: string } | null;
      error?: string;
      period_end: string;
      period_start: string;
      source_filename: string | null;
      statement_month: string;
      transactions: {
        amount: number;
        recipient: string;
        title: string;
        transaction_date: string;
      }[];
    };

    if (!previewResponse.ok || previewPayload.transactions.length === 0) {
      throw new Error(previewPayload.error ?? "Could not preview the E2E import");
    }

    const commitResponse = await fetch("/api/imports/commit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        bank: previewPayload.bank,
        confirm_replace: Boolean(previewPayload.existing_batch),
        period_end: previewPayload.period_end,
        period_start: previewPayload.period_start,
        source_filename: previewPayload.source_filename,
        statement_month: previewPayload.statement_month,
        transactions: previewPayload.transactions,
      }),
    });
    const commitPayload = (await commitResponse.json()) as {
      batch?: {
        id: string;
        source_filename: string | null;
      };
      error?: string;
    };

    if (!commitResponse.ok || !commitPayload.batch) {
      throw new Error(commitPayload.error ?? "Could not commit the E2E import");
    }

    return {
      id: commitPayload.batch.id,
      sourceFilename: commitPayload.batch.source_filename ?? sourceFilename,
    };
  }, options);
}

// risk: test-plan.md #3 - import history switching keeps persisted review state truthful
// seed: tests/e2e/seed.spec.ts
test.describe("risk #3 - import history switching preserves review changes", () => {
  test("save-and-switch keeps review edits, and completed history stays reopenable", async ({ page, request }) => {
    test.setTimeout(90_000);

    const timestamp = Date.now();
    const categoryName = `E2E Import History ${timestamp}`;
    const revolutFilename = `revolut-history-${timestamp}.csv`;
    const ingFilename = `ing-history-${timestamp}.csv`;
    let categoryId: string | null = null;

    try {
      const category = await createCategory(request, categoryName);
      categoryId = category.id;

      // Set up two owned batches through the authenticated API flow so the test can switch between them.
      await page.goto("/imports");
      await expect(page.getByRole("heading", { name: /import and review your bank statement/i })).toBeVisible();

      const revolutBatch = await commitImportBatchFromPage(page, {
        bank: "revolut",
        csvContent: revolutCsvContent,
        sourceFilename: revolutFilename,
      });
      const ingBatch = await commitImportBatchFromPage(page, {
        bank: "ing",
        csvContent: ingCsvContent,
        sourceFilename: ingFilename,
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
