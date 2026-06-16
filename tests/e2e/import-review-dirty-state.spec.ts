import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const sampleCsvContent = readFileSync(
  path.resolve(process.cwd(), "context/foundation/resources/revolut-statement-example.csv"),
  "utf8",
);

test("import review does not allow completion while category drafts are unsaved [risk #3]", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const categoryName = `E2E Risk 3 ${Date.now()}`;
  let categoryId: string | null = null;

  try {
    const createCategoryResponse = await request.post("/api/budget/categories", {
      data: {
        carryover_enabled: false,
        name: categoryName,
        percentage_limit: 0,
      },
    });
    const createdCategoryPayload = (await createCategoryResponse.json()) as {
      category?: { id: string; name: string };
      error?: string;
    };

    if (!createCategoryResponse.ok() || !createdCategoryPayload.category) {
      throw new Error(createdCategoryPayload.error ?? "Could not create test category");
    }

    categoryId = createdCategoryPayload.category.id;

    await page.goto("/imports");
    await expect(page.getByRole("heading", { name: /import and review your bank statement/i })).toBeVisible();
    const batch = await page.evaluate(
      async ({ csvContent }) => {
        const formData = new FormData();
        formData.set("bank", "revolut");
        formData.set("file", new File([csvContent], "revolut-statement-example.csv", { type: "text/csv" }));

        const previewResponse = await fetch("/api/imports/preview", {
          method: "POST",
          body: formData,
        });
        const previewPayload = (await previewResponse.json()) as {
          bank: "revolut" | "ing";
          existing_batch: { id: string } | null;
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
          error?: string;
        };

        if (!previewResponse.ok || previewPayload.transactions.length === 0) {
          throw new Error(previewPayload.error ?? "Could not preview test import");
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
        const commitPayload = (await commitResponse.json()) as { batch?: { id: string }; error?: string };

        if (!commitResponse.ok || !commitPayload.batch) {
          throw new Error(commitPayload.error ?? "Could not commit test import");
        }

        return commitPayload.batch;
      },
      { csvContent: sampleCsvContent },
    );
    await page.goto(`/imports?batch=${batch.id}`);
    await expect(page.getByText("Transaction Review")).toBeVisible();
    await expect(page.getByRole("heading", { name: /this batch still needs review confirmation/i })).toBeVisible();

    const completeReviewButton = page.getByRole("button", { name: "Mark review complete" });
    await expect(completeReviewButton).toBeEnabled();

    await page.getByRole("combobox").first().selectOption({ value: categoryId });
    await expect(page.getByRole("combobox").first()).toHaveValue(categoryId);

    await expect(page.getByText("1 unsaved change")).toBeVisible();
    await expect(
      page.getByText("Save or discard unsaved review changes before marking this review complete."),
    ).toBeVisible();
    await expect(completeReviewButton).toBeDisabled();

    const saveReviewResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/imports/transactions/bulk") && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Save all changes" }).click();
    await saveReviewResponse;
    await expect(page.getByText("Review changes saved.").first()).toBeVisible();

    await expect(page.getByText("1 unsaved change")).toHaveCount(0);
    await expect(
      page.getByText("Save or discard unsaved review changes before marking this review complete."),
    ).toHaveCount(0);
    await expect(completeReviewButton).toBeEnabled();
  } finally {
    if (categoryId) {
      try {
        await request.delete(`/api/budget/categories/${categoryId}`);
      } catch {
        // Ignore cleanup failures so the primary assertion failure stays visible.
      }
    }
  }
});
