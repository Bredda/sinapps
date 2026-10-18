import { expect, test as setup } from "@playwright/test";
import { signIn } from "./helpers";

setup("sign in as bob and keep the session", async ({ page }) => {
  await signIn(page, "bob");
  await expect(page.getByRole("heading", { name: "What can I build for you?" })).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/bob.json" });
});
