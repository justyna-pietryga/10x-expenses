import { expect, test, type Page } from "@playwright/test";

function getTransactionRow(page: Page, recipient: string) {
  return page.getByRole("row").filter({ hasText: recipient });
}

async function commitImportBatchFromTransactions(
  page: Page,
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
  return page.evaluate(async (commitPayload) => {
    const response = await fetch("/api/imports/commit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...commitPayload,
        confirm_replace: true,
      }),
    });
    const body = (await response.json()) as {
      batch?: {
        id: string;
      };
      error?: string;
    };

    if (!response.ok || !body.batch) {
      throw new Error(body.error ?? "Could not commit the E2E import batch");
    }

    return body.batch;
  }, payload);
}

// risk: transaction inclusion stays truthful across review, completed edits, and dashboard reconciliation
// seed: tests/e2e/seed.spec.ts
test.describe("transaction inclusion control", () => {
  test("excluded rows stay out of budget math and can be restored on a completed batch", async ({ page }) => {
    test.setTimeout(90_000);

    const timestamp = Date.now();
    const uniqueYear = 3000 + Math.floor(Math.random() * 6000);
    const monthPrefix = `${uniqueYear}-01`;
    const statementMonth = `${monthPrefix}-01`;
    const outflowRecipient = `E2E Transfer Out ${timestamp}`;
    const inflowRecipient = `E2E Transfer In ${timestamp}`;
    const includedRecipient = `E2E Groceries ${timestamp}`;

    // Seed a unique owned batch through the real import API so the browser flow can focus on inclusion behavior.
    await page.goto("/imports");
    await expect(page.getByRole("heading", { name: /import and review your bank statement/i })).toBeVisible();

    const batch = await commitImportBatchFromTransactions(page, {
      bank: "ing",
      period_end: `${monthPrefix}-31`,
      period_start: `${monthPrefix}-01`,
      source_filename: `transaction-inclusion-${timestamp}.csv`,
      statement_month: statementMonth,
      transactions: [
        {
          amount: -123.45,
          recipient: outflowRecipient,
          title: "Own transfer out",
          transaction_date: `${monthPrefix}-05`,
        },
        {
          amount: 67.89,
          recipient: inflowRecipient,
          title: "Own transfer in",
          transaction_date: `${monthPrefix}-06`,
        },
        {
          amount: -10,
          recipient: includedRecipient,
          title: "Included groceries",
          transaction_date: `${monthPrefix}-07`,
        },
      ],
    });

    await page.goto(`/imports?batch=${batch.id}`);
    await expect(page.getByRole("heading", { name: "This batch still needs review confirmation." })).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(2);

    // Exclude one outflow and one inflow, then save them together through the normal review workflow.
    await getTransactionRow(page, outflowRecipient).getByRole("button", { name: "Exclude" }).click();
    await getTransactionRow(page, inflowRecipient).getByRole("button", { name: "Exclude" }).click();
    await expect(page.getByText("2 unsaved changes")).toBeVisible();

    const saveExcludedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/imports/transactions/bulk") && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Save all changes" }).click();
    await saveExcludedResponse;
    await expect(page.getByText("Review changes saved.").first()).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(1);
    await expect(page.getByText("Excluded transactions (2)")).toBeVisible();

    // Expand the excluded section and confirm both rows moved out of the default review table.
    await page.getByText("Excluded transactions (2)").click();
    await expect(getTransactionRow(page, outflowRecipient)).toContainText("Restore to review");
    await expect(getTransactionRow(page, inflowRecipient)).toContainText("Restore to review");

    // Complete the review so the next restore runs against a historical completed batch.
    const completeReviewResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/imports/batches/${batch.id}/complete`) && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Mark review complete" }).click();
    await completeReviewResponse;
    await expect(page.getByText("Review marked complete.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This batch was already confirmed and stays open for corrections." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark review complete" })).toHaveCount(0);

    // The dashboard should reconcile excluded outflow and inflow separately while keeping them out of budget math.
    await page.goto(`/dashboard?month=${monthPrefix}`);
    await expect(page.getByText("Excluded transactions", { exact: true })).toBeVisible();
    await expect(page.getByText("Excluded outflow", { exact: true })).toBeVisible();
    await expect(page.getByText("Excluded inflow", { exact: true })).toBeVisible();
    await expect(page.getByText("123.45 PLN")).toBeVisible();
    await expect(page.getByText("67.89 PLN")).toBeVisible();

    // Reopen the completed batch, restore the inflow row, and confirm completed status still holds after saving.
    await page.goto(`/imports?batch=${batch.id}`);
    await expect(
      page.getByRole("heading", { name: "This batch was already confirmed and stays open for corrections." }),
    ).toBeVisible();
    await expect(page.getByText("Excluded transactions (2)")).toBeVisible();
    await page.getByText("Excluded transactions (2)").click();
    await getTransactionRow(page, inflowRecipient).getByRole("button", { name: "Restore to review" }).click();
    await expect(page.getByText("1 unsaved change")).toBeVisible();

    const restoreResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/imports/transactions/bulk") && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Save all changes" }).click();
    await restoreResponse;
    await expect(page.getByText("Review changes saved.").first()).toBeVisible();
    await expect(page.getByText("Excluded transactions (1)")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This batch was already confirmed and stays open for corrections." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark review complete" })).toHaveCount(0);

    const restoredRow = getTransactionRow(page, inflowRecipient);
    await expect(restoredRow.getByRole("combobox")).toHaveCount(0);
    await expect(restoredRow).toContainText("Income row; no expense category needed.");
  });
});
