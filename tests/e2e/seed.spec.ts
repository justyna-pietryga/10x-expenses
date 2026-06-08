import { test, expect } from "@playwright/test";

/**
 * NOTE:
 * That is the seed test example to reflect the way the e2e test should be shaped in this project
 * including test name convention. 
 * The risk does not exist in test-plan.md. It serves as an not overcomplicated example.
 * If some real test are useful but does not exist in test-plan.md - skip indicating risk number.
 */

test("income amount is not disappear or taken from wrong month [risk #0]", async ({ page }) => {
  await page.goto("/budget?month=2026-06");
  await expect(page.getByRole("heading", { name: /budget setup for/i })).toBeVisible();

  await page.getByRole("spinbutton", { name: "Income amount" }).fill("5000");
  await page.getByRole("button", { name: "Save income" }).click();
  await page.reload();

  await expect(page.getByText("Last saved amount:")).toContainText("5000");

  //cleanup
  await page.getByRole("spinbutton", { name: "Income amount" }).fill("5000");
  await page.getByRole("button", { name: "Save income" }).click();
});
