import { test, expect } from "@playwright/test";

/**
 * NOTE:
 * That is the seed test example to reflect the way the e2e test should be shaped in this project
 * including test name convention.
 * The risk does not exist in test-plan.md. It serves as an not overcomplicated example.
 * If some real test are useful but does not exist in test-plan.md - skip indicating risk number.
 */

test("income amount is not disappear or taken from wrong month [risk #0]", async ({ page, request }) => {
  const month = "2026-06-01";
  const budgetPath = "/budget?month=2026-06";
  const incomeInput = page.getByRole("spinbutton", { name: "Income amount" });
  const estimatedCheckbox = page.getByRole("checkbox", { name: "Estimated amount" });
  const savedAmount = page.getByText("Last saved amount:");

  await page.goto("/budget?month=2026-06");
  await expect(page.getByRole("heading", { name: /budget setup for/i })).toBeVisible();

  const initialAmountText = (await savedAmount.count()) > 0 ? await savedAmount.textContent() : null;
  const initialAmountMatch = initialAmountText?.match(/Last saved amount:\s*([0-9]+(?:\.[0-9]+)?)/);
  const initialAmount = initialAmountMatch ? initialAmountMatch[1] : null;
  const initialEstimated = await estimatedCheckbox.isChecked();

  try {
    await incomeInput.fill("5000");
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/budget/income") && response.ok()),
      page.getByRole("button", { name: "Save income" }).click(),
    ]);
    await expect(savedAmount).toContainText("5000");
    await page.reload();

    await expect(savedAmount).toContainText("5000");
  } finally {
    if (initialAmount === null) {
      await request.delete("/api/budget/income", {
        data: {
          month,
        },
      });
      await page.goto(budgetPath);
      await expect(savedAmount).toHaveCount(0);
      await expect(incomeInput).toHaveValue("");
      await expect(estimatedCheckbox).not.toBeChecked();
    } else {
      await request.post("/api/budget/income", {
        data: {
          month,
          amount: Number(initialAmount),
          is_estimated: initialEstimated,
        },
      });
      await page.goto(budgetPath);
      await expect(savedAmount).toContainText(initialAmount);
      await expect(incomeInput).toHaveValue(initialAmount);

      if (initialEstimated) {
        await expect(estimatedCheckbox).toBeChecked();
      } else {
        await expect(estimatedCheckbox).not.toBeChecked();
      }
    }
  }
});
