import { expect, test } from "@playwright/test";
import { fixtures } from "../src/lib/part-fixtures";

/**
 * The /dev/parts catalog renders every message part in each state. Screenshots are
 * attached to the report as a visual catalog (not compared: fonts differ across machines).
 */
test.describe("parts catalog", () => {
  test("every fixture renders without console errors", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/dev/parts");
    const sections = page.getByTestId("fixture");
    await expect(sections).toHaveCount(fixtures.length);
    for (const [index, fixture] of fixtures.entries()) {
      const section = sections.nth(index);
      await expect(section.getByRole("heading", { level: 2 })).toHaveText(fixture.title);
      await section.scrollIntoViewIfNeeded();
      await testInfo.attach(fixture.title, {
        body: await section.screenshot(),
        contentType: "image/png",
      });
    }
    expect(errors).toEqual([]);
  });

  test("Markdown, tool states, errors and markers", async ({ page }) => {
    await page.goto("/dev/parts");
    const section = (title: string) => page.getByTestId("fixture").filter({ hasText: title });

    const markdown = section("Text: Markdown");
    await expect(markdown.getByRole("table")).toContainText("€14.99");
    await expect(markdown.locator(".katex").first()).toBeVisible();
    await expect(markdown.getByRole("link", { name: /Best mobile plans/ })).toBeVisible();

    const tools = section("Tool calls");
    await expect(tools.getByRole("button", { name: /Searching the web for/ })).toHaveCount(2);
    await expect(tools.getByRole("button", { name: /Couldn't search the web/ })).toBeVisible();
    await expect(tools.getByRole("button", { name: /Searched the web for .*cancelled/ })).toBeVisible();

    const errors = section("Errors");
    await expect(errors.getByText("The model took too long to answer.")).toBeVisible();
    await expect(errors.getByRole("button", { name: "Retry" })).toHaveCount(2);

    await expect(section("Markers").getByText("Fixing the widget")).toBeVisible();
    await expect(section("from a widget").locator("[data-slot=badge]")).toBeVisible();
  });
});
