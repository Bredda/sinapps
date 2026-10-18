import { expect, type Page } from "@playwright/test";

/**
 * Signs in through the Keycloak login page (dev realm users: alice, bob, carol; password = username).
 * Clicking before React hydrates does nothing: retry until the redirect to Keycloak happens.
 */
export async function signIn(page: Page, user: string) {
  await page.goto("/login");
  await signInFromLoginPage(page, user);
}

/** From the login page (possibly with a `redirect` search param already set). */
export async function signInFromLoginPage(page: Page, user: string) {
  const loginUrl = page.url();
  await expect(async () => {
    if (page.url() !== loginUrl) await page.goto(loginUrl);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/realms\/sinapps\//, { timeout: 5000 });
  }).toPass({ timeout: 60_000 });
  await page.getByRole("textbox", { name: "Username or email" }).fill(user);
  await page.getByRole("textbox", { name: "Password" }).fill(user);
  await page.getByRole("button", { name: "Sign In" }).click();
}

/**
 * Sends a prompt from the composer, from the home page or inside a conversation.
 * The Send button only enables once React has received the text, so waiting for it
 * also waits for hydration.
 */
export async function send(page: Page, text: string) {
  const composer = page.getByRole("textbox", { name: "Ask anything…" });
  await expect(async () => {
    // Clear first: once hydrated, React ignores a fill that leaves the DOM value unchanged.
    await composer.fill("");
    await composer.fill(text);
    await expect(page.getByRole("button", { name: "Send" })).toHaveAttribute("aria-disabled", "false", {
      timeout: 1000,
    });
  }).toPass({ timeout: 30_000 });
  await composer.press("Enter");
}

/** The conversation transcript. */
export const transcript = (page: Page) => page.getByRole("log");

export async function expectAnswerDone(page: Page) {
  await expect(page.getByRole("button", { name: "Regenerate" })).toBeVisible();
}
