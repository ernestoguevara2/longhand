import { expect, test, type Page, type Route } from "@playwright/test";

const REWRITE_PARTS = [
  "People in town rely on the Harbor Street Library, which opened in 1962 and still draws a crowd most days.",
  "It ran 214 computer classes last year, mostly for older residents, and its free rooms were booked more than 3,000 times.",
  "Money is the problem. Funding has dropped 12 percent since 2019, and some worry about further cuts.",
].join("\n\n");

/** Answers Ollama's API from the page's network layer, so no model is needed. */
async function mockOllama(page: Page, options: { rewrite?: string; offline?: boolean } = {}) {
  const prompts: string[] = [];
  if (options.offline) {
    await page.route("**/api/tags", (route) => route.abort());
    return prompts;
  }
  await page.route("http://localhost:11434/api/tags", (route) =>
    route.fulfill({ json: { models: [{ name: "mock-model" }] }, headers: { "access-control-allow-origin": "*" } }),
  );
  await page.route("http://localhost:11434/api/chat", async (route: Route) => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON() as { messages: { content: string }[]; stream?: boolean };
    const prompt = body.messages.map((m) => m.content).join("\n");
    prompts.push(prompt);
    let content = options.rewrite ?? REWRITE_PARTS;
    if (prompt.includes('"alternatives"')) {
      content = JSON.stringify({
        alternatives: [
          "Harbor Street Library opened in 1962, and people in town will still tell you how proud of it they are if you ask them about it.",
        ],
      });
    } else if (prompt.includes('"problems"')) {
      content = JSON.stringify({ problems: [] });
    }
    const message = { role: "assistant", content };
    const done = { model: "mock-model", created_at: "2026-01-01T00:00:00Z", done: true, done_reason: "stop", message, prompt_eval_count: 1, eval_count: 1 };
    if (body.stream) {
      const start = { ...done, done: false, done_reason: undefined };
      const end = { ...done, message: { role: "assistant", content: "" } };
      return route.fulfill({
        headers: { ...headers, "content-type": "application/x-ndjson" },
        body: `${JSON.stringify(start)}\n${JSON.stringify(end)}\n`,
      });
    }
    return route.fulfill({ json: done, headers });
  });
  return prompts;
}

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample draft" }).waitFor();
}

test.describe("scanning", () => {
  test("marks sentences as you type and explains them", async ({ page }) => {
    await mockOllama(page);
    await start(page);
    await page.getByRole("textbox", { name: "Draft" }).fill(
      "In today's rapidly evolving landscape, public libraries play a crucial role in fostering vibrant communities everywhere across the whole country, and that is something that many people care about a great deal these days. They are not just buildings full of books; they are dynamic hubs. At its core, a library is a pivotal investment in people, and people keep coming back to it year after year for reasons that vary widely.",
    );
    await expect(page.getByTestId("Draft-marks").locator(".mark-strong").first()).toBeVisible();
    await expect(page.getByTestId("score-ai signal")).toBeVisible();

    const note = page.getByTestId("margin-notes").getByRole("button").first();
    await note.click();
    await expect(page.getByTestId("margin-notes")).toContainText("Inflated significance.");
  });

  test("gives no verdict on very short text", async ({ page }) => {
    await mockOllama(page);
    await start(page);
    await page.getByRole("textbox", { name: "Draft" }).fill("Regular exercise plays a crucial role in health.");
    await expect(page.getByText("Not enough text")).toBeVisible();
    await expect(page.getByText("Under 50 words is too short for a verdict.")).toBeVisible();
  });

  test("shows no percentage for text that is not English", async ({ page }) => {
    await mockOllama(page);
    await start(page);
    await page.getByRole("textbox", { name: "Draft" }).fill(
      "La biblioteca del pueblo cierra a las seis de la tarde todos los días de la semana, y eso es molesto para quienes trabajan hasta tarde en el centro de la ciudad. Muchos vecinos han pedido que abra una noche más, pero el ayuntamiento dice que no hay dinero para pagar al personal durante esas horas extra en el presupuesto.",
    );
    await expect(page.getByText("Scores are calibrated for English only")).toBeVisible();
  });

  test("asks before downloading the model, and the quick read keeps working if declined", async ({ page }) => {
    await mockOllama(page);
    await start(page);
    await page.getByRole("button", { name: "Try a sample draft" }).click();
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    await expect(page.getByTestId("deep-consent")).toContainText("125 MB");
    await page.getByRole("button", { name: "Keep quick read" }).click();
    await expect(page.getByTestId("deep-consent")).toBeHidden();
    await expect(page.getByText("Quick read", { exact: true })).toBeVisible();
  });
});

test.describe("rewriting", () => {
  test("rewrites, compares, refines, copies, downloads, and saves to history", async ({ page }) => {
    const prompts = await mockOllama(page);
    await start(page);
    await page.getByRole("button", { name: "Try a sample draft" }).click();
    await page.getByRole("radio", { name: "Light" }).click();
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();

    const rewrite = page.getByRole("textbox", { name: "Rewrite" });
    await expect(rewrite).toHaveValue(REWRITE_PARTS, { timeout: 30_000 });
    expect(prompts[0]).toContain("LIGHT");
    expect(prompts[0]).toContain("Harbor Street Library");

    await expect(page.getByTestId("score-before")).toBeVisible();
    await expect(page.getByTestId("score-after")).toBeVisible();
    await expect(page.getByTestId("review-list")).toBeVisible();

    await page.getByRole("tab", { name: "Side by side" }).click();
    await expect(page.getByTestId("side-by-side")).toContainText("rapidly evolving");
    await page.getByRole("tab", { name: "Changes" }).click();
    await expect(page.getByTestId("inline-changes").locator("del").first()).toBeVisible();
    await page.getByRole("tab", { name: "Rewrite" }).click();

    await page.getByRole("button", { name: "Copy rewrite" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    // Windows clipboards store line breaks as CRLF.
    const copiedText = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedText.replace(/\r\n/g, "\n")).toBe(REWRITE_PARTS);

    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .md" }).click();
    expect((await downloading).suggestedFilename()).toBe("longhand-rewrite.md");

    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("dialog")).toContainText("People in town rely");
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("dialog")).toContainText("Rewrites you make will appear here.");
    await page.keyboard.press("Escape");

    await page.reload();
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("dialog")).toContainText("Rewrites you make will appear here.");
  });

  test("offers other wordings for a flagged sentence and swaps one in", async ({ page }) => {
    const flagged =
      "Founded in 1962, the Harbor Street Library stands as a testament to civic pride across the entire town, and that is what people in town tend to say about it whenever they are asked about the place. Its staff run classes for older residents every week of the year, usually on weekday afternoons when the rooms are quiet.";
    await mockOllama(page, { rewrite: flagged });
    await start(page);
    await page.getByRole("textbox", { name: "Draft" }).fill(
      "Founded in 1962, the Harbor Street Library is a place people in town are proud of, as they will tell you if you ask them about it on any day. Its staff run classes for older residents every week of the year, usually on weekday afternoons when the rooms are quiet, and the classes are popular.",
    );
    await page.getByRole("radio", { name: "Light" }).click();
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Rewrite" })).toHaveValue(flagged, { timeout: 30_000 });

    await page.getByTestId("margin-notes").getByRole("button").first().click();
    await page.getByRole("button", { name: "Try other wordings" }).click();
    await page.getByRole("button", { name: /Harbor Street Library opened in 1962/ }).click();
    await expect(page.getByRole("textbox", { name: "Rewrite" })).toHaveValue(/^Harbor Street Library opened in 1962/);
  });

  test("flags a changed number instead of hiding it", async ({ page }) => {
    await mockOllama(page, { rewrite: REWRITE_PARTS.replace("214", "241").replace("12 percent", "21 percent") });
    await start(page);
    await page.getByRole("button", { name: "Try a sample draft" }).click();
    await page.getByRole("radio", { name: "Light" }).click();
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(page.getByTestId("review-list")).toContainText(/Missing numbers: .*214/, { timeout: 30_000 });
  });

  test("opens Settings with a clear message when Ollama is offline", async ({ page }) => {
    await mockOllama(page, { offline: true });
    await start(page);
    await page.getByRole("button", { name: "Try a sample draft" }).click();
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Ollama did not respond");
  });

  test("asks for a key before using a cloud provider, and labels where text goes", async ({ page }) => {
    await mockOllama(page);
    await start(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Provider").selectOption("anthropic");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("privacy-label")).toContainText("Rewrites go to Anthropic");
    await page.getByRole("button", { name: "Try a sample draft" }).click();
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Add your Anthropic API key");
  });

  test("streams a cloud rewrite through the server route, sending the key in a header", async ({ page }) => {
    await mockOllama(page);
    let header: string | null = null;
    await page.route("**/api/humanize", async (route) => {
      header = route.request().headerValue ? await route.request().headerValue("x-provider-key") : null;
      const result = {
        best: { text: REWRITE_PARTS, violations: [], changed: 0.7, tellsPer100: 0, repaired: false },
        candidates: [{ text: REWRITE_PARTS, violations: [], changed: 0.7, tellsPer100: 0, repaired: false }],
        factProblems: [],
      };
      await route.fulfill({
        headers: { "content-type": "application/x-ndjson" },
        body: `${JSON.stringify({ type: "stage", stage: "writing", candidate: 1, of: 1 })}\n${JSON.stringify({ type: "result", result })}\n`,
      });
    });
    await start(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Provider").selectOption("anthropic");
    await page.getByLabel("API key", { exact: true }).fill("test-key-123");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Try a sample draft" }).click();
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Rewrite" })).toHaveValue(REWRITE_PARTS, { timeout: 30_000 });
    expect(header).toBe("test-key-123");
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("test-key-123");
  });

  test("keeps working text when a provider fails, and offers a retry", async ({ page }) => {
    await mockOllama(page);
    await page.route("**/api/humanize", (route) =>
      route.fulfill({
        headers: { "content-type": "application/x-ndjson" },
        body: `${JSON.stringify({ type: "error", code: "rate-limit", message: "The provider is rate limiting requests. Wait a moment and retry." })}\n`,
      }),
    );
    await start(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Provider").selectOption("anthropic");
    await page.getByLabel("API key", { exact: true }).fill("k");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Try a sample draft" }).click();
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(page.getByTestId("review-list")).toContainText("kept the original text", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Retry failed parts" })).toBeVisible();
  });
});

test("the how it works page explains the limits", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/not proof/i).first()).toBeVisible();
});

test("the phone layout has no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockOllama(page);
  await start(page);
  await page.getByRole("button", { name: "Try a sample draft" }).click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("responses from the API are never cached", async ({ request }) => {
  const response = await request.get("/api/config");
  expect(response.headers()["cache-control"]).toBe("no-store");
});
