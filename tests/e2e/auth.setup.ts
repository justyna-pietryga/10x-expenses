import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

test.use({ storageState: { cookies: [], origins: [] } });

test("creates a local auth session for product specs", async ({ page }) => {
  const uniqueEmail = `e2e-${Date.now()}@example.com`;
  const password = "e2e-pass-123";

  await page.goto("/");

  await page.evaluate(
    ({ email, password: runPassword }) => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/signup";

      for (const [name, value] of Object.entries({
        email,
        password: runPassword,
        confirmPassword: runPassword,
      })) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.append(input);
      }

      document.body.append(form);
      form.submit();
    },
    {
      email: uniqueEmail,
      password,
    },
  );
  await expect(page).toHaveURL(/\/auth\/confirm-email$/);

  await page.evaluate(
    ({ email, password: runPassword }) => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/signin";

      for (const [name, value] of Object.entries({
        email,
        password: runPassword,
      })) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.append(input);
      }

      document.body.append(form);
      form.submit();
    },
    {
      email: uniqueEmail,
      password,
    },
  );
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  mkdirSync("playwright/.auth", { recursive: true });
  await page.context().storageState({ path: authFile });
});
