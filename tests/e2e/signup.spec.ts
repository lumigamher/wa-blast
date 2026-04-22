import { test, expect } from "@playwright/test";

test("signup shows check-inbox screen on success", async ({ page }) => {
  await page.goto("/signup");
  await page.getByPlaceholder("Your name").fill("Tester");
  await page.getByPlaceholder("Email").fill(`e2e-${Date.now()}@test.local`);
  await page.getByPlaceholder(/Password/).fill("password1234");
  await page.getByRole("button", { name: /Sign up/i }).click();
  await expect(page.getByText(/Check your inbox/)).toBeVisible({ timeout: 10_000 });
});
