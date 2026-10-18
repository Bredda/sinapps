import { expect, test } from "@playwright/test";
import { expectAnswerDone, send, transcript } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What can I build for you?" })).toBeVisible();
});

test("a ReAct turn: reasoning, web search, Markdown answer, title, persistence", async ({ page }) => {
  await send(page, "search the weather in Lisbon");
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  await expect(transcript(page).getByText("search the weather in Lisbon", { exact: true })).toBeVisible();

  // The answer streams in after the tool ran: GFM table and highlighted code block.
  const log = transcript(page);
  await expect(log.getByText("Here is what I found")).toBeVisible();
  await expect(log.getByRole("table")).toContainText("Sunny");
  await expect(log.getByText("const answer = 42;")).toBeVisible();
  await expectAnswerDone(page);

  // The Trace collapsed into a summary; opening it shows both steps.
  await log.getByRole("button", { name: /2 steps/ }).click();
  await expect(log.getByRole("button", { name: "Thought" })).toBeVisible();
  const search = log.getByRole("button", { name: /Searched the web for/ });
  await search.click();
  await expect(log.getByRole("link", { name: /Weather in Lisbon/ })).toBeVisible();

  // Generated title in the sidebar, details popover with the model and tokens.
  await expect(page.getByRole("link", { name: "Mock conversation" })).toBeVisible();
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("dialog")).toContainText("Mock Smart");
  await page.keyboard.press("Escape");

  // Everything comes back from the database after a reload.
  await page.reload();
  await expect(log.getByRole("table")).toContainText("Sunny");
  await expect(log.getByRole("button", { name: /2 steps/ })).toBeVisible();
});

test("a provider error is shown with a retry, and kept after a reload", async ({ page }) => {
  await send(page, "boom");
  const log = transcript(page);
  await expect(log.getByText("The model provider returned an error.")).toBeVisible();
  await expect(log.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.reload();
  await expect(log.getByText("The model provider returned an error.")).toBeVisible();
});

test("Stop freezes the answer with a marker and gives the composer back", async ({ page }) => {
  await send(page, "slow please");
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(transcript(page).getByText("Stopped")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});

test("edit the last message and regenerate the answer", async ({ page }) => {
  await send(page, "hello");
  const log = transcript(page);
  await expect(log.getByText("Mock answer to: hello")).toBeVisible();
  await expectAnswerDone(page);

  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(log.getByText("Mock answer to: hello")).toHaveCount(1);
  await expectAnswerDone(page);

  await page.getByRole("button", { name: "Edit message" }).click();
  await page.getByRole("textbox", { name: "Edit message" }).fill("hi there");
  await page.getByRole("button", { name: "Send" }).first().click();
  await expect(log.getByText("Mock answer to: hi there")).toBeVisible();
  await expect(log.getByText("Mock answer to: hello")).toHaveCount(0);
  await expectAnswerDone(page);
});

test("switching model mid-conversation adds a marker", async ({ page }) => {
  await send(page, "hello");
  await expectAnswerDone(page);
  await page.getByRole("combobox", { name: "Model" }).click();
  await page.getByRole("option", { name: /Mock Fast/ }).click();
  await send(page, "and now?");
  await expect(transcript(page).getByText("Now answering with Mock Fast")).toBeVisible();
  await expect(transcript(page).getByText("Mock answer to: and now?")).toBeVisible();
});
