import { expect, test } from "@playwright/test";
import { signIn, signInFromLoginPage } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test("anonymous visitors are sent to the login page, then back where they were", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await signInFromLoginPage(page, "bob");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("a user without the required realm role is denied", async ({ page }) => {
  await signIn(page, "carol");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("signing out ends the session", async ({ page }) => {
  await signIn(page, "bob");
  const signOut = page.getByRole("menuitem", { name: "Sign out" });
  // The menu only opens once the page is hydrated.
  await expect(async () => {
    if (!(await signOut.isVisible())) await page.getByRole("button", { name: "Account menu" }).click();
    await expect(signOut).toBeVisible({ timeout: 1500 });
  }).toPass();
  await signOut.click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
